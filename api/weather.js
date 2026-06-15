// Serverless function for the RunThink hyperlocal weather page.
// PUBLIC-SOURCES VERSION: no API keys, no signups required.
//
// Sources (all free, no key):
//   1. National Weather Service (api.weather.gov) - nearest official observation station
//   2. Open-Meteo (open-meteo.com)               - modeled current temp for the exact spot
//   3. Open-Meteo Geocoding                       - turns a zip/city into lat/lon
//
// We take both independent readings, show each, and present a blended number.

const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes
const STALE_MINUTES = 90;           // NWS obs can lag ~1-2h; allow up to 90 min

const cache = new Map();
function cacheGet(k){ const h=cache.get(k); if(h && Date.now()-h.t<CACHE_TTL_MS) return h.v; cache.delete(k); return null; }
function cacheSet(k,v){ cache.set(k,{v,t:Date.now()}); }

// NWS asks for a User-Agent identifying the app
const UA = { "User-Agent": "RunThink-Weather (contact: hello@runthink.example)", "Accept": "application/geo+json" };

function cToF(c){ return (c * 9) / 5 + 32; }

// --- Geocoding: zip or city -> lat/lon, via Open-Meteo (no key) ---
async function geocode(query){
  const q = query.trim();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("Could not look up that location");
  const d = await r.json();
  if(!d.results || !d.results.length) throw new Error("Could not find that place. Try a city name or a different spelling.");
  const top = d.results[0];
  return { lat: top.latitude, lon: top.longitude, name: top.name };
}

// --- NWS nearest official station current temp ---
async function fetchNWS(lat, lon){
  try{
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: UA });
    if(!pr.ok) return null;
    const pd = await pr.json();
    const stationsUrl = pd?.properties?.observationStations;
    if(!stationsUrl) return null;

    const sr = await fetch(stationsUrl, { headers: UA });
    if(!sr.ok) return null;
    const sd = await sr.json();
    const stations = sd?.features || [];
    if(!stations.length) return null;

    // try the nearest few until one has a usable temperature
    for(const st of stations.slice(0, 4)){
      const id = st?.properties?.stationIdentifier;
      const name = st?.properties?.name;
      if(!id) continue;
      try{
        const or = await fetch(`https://api.weather.gov/stations/${id}/observations/latest`, { headers: UA });
        if(!or.ok) continue;
        const od = await or.json();
        const tC = od?.properties?.temperature?.value;
        const ts = od?.properties?.timestamp;
        if(typeof tC !== "number") continue;
        if(ts){
          const ageMin = (Date.now() - new Date(ts).getTime()) / 60000;
          if(ageMin > STALE_MINUTES) continue;
        }
        return { source: "NWS station", label: name || id, temp: cToF(tC) };
      }catch(_){ continue; }
    }
    return null;
  }catch(_){ return null; }
}

// --- Open-Meteo current temp for the exact point ---
async function fetchOpenMeteo(lat, lon){
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&temperature_unit=fahrenheit`;
    const r = await fetch(url);
    if(!r.ok) return null;
    const d = await r.json();
    const t = d?.current?.temperature_2m;
    if(typeof t !== "number") return null;
    return { source: "Open-Meteo", label: "modeled for your spot", temp: t };
  }catch(_){ return null; }
}

// --- OpenWeatherMap current conditions (needs free key) ---
async function fetchOpenWeather(lat, lon){
  const key = process.env.OPENWEATHER_API_KEY;
  if(!key) return null; // silently skipped if no key set
  try{
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${key}`;
    const r = await fetch(url);
    if(!r.ok) return null;
    const d = await r.json();
    const t = d?.main?.temp;
    if(typeof t !== "number") return null;
    return { source: "OpenWeather", label: "blended observation + model", temp: t };
  }catch(_){ return null; }
}

// --- Visual Crossing Timeline current conditions (needs free key) ---
async function fetchVisualCrossing(lat, lon){
  const key = process.env.VISUALCROSSING_API_KEY;
  if(!key) return null; // silently skipped if no key set
  try{
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lon}?include=current&unitGroup=us&contentType=json&key=${key}`;
    const r = await fetch(url);
    if(!r.ok) return null;
    const d = await r.json();
    const t = d?.currentConditions?.temp;
    if(typeof t !== "number") return null;
    return { source: "Visual Crossing", label: "radar + sensor blend", temp: t };
  }catch(_){ return null; }
}

// --- blend: show all readings; trim high & low only when 4+ ---
function blend(readings){
  const sorted = [...readings].sort((a, b) => a.temp - b.temp);
  let trimmedIds = new Set();
  let used = sorted;
  if(sorted.length >= 4){
    trimmedIds.add(sorted[0]);
    trimmedIds.add(sorted[sorted.length - 1]);
    used = sorted.slice(1, -1);
  }
  const avg = used.reduce((a, r) => a + r.temp, 0) / used.length;
  return { avg, trimmedIds, usedCount: used.length };
}

export default async function handler(req, res){
  const q = req.query || {};
  let { lat, lon, location } = q;

  try{
    let placeName = null;
    if((!lat || !lon) && location){
      const geo = await geocode(location);
      lat = geo.lat; lon = geo.lon; placeName = geo.name;
    }
    if(!lat || !lon){ res.status(400).json({ error: "Provide a location, or share your position." }); return; }
    lat = parseFloat(lat); lon = parseFloat(lon);

    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = cacheGet(cacheKey);
    if(cached){ res.status(200).json({ ...cached, cached: true }); return; }

    const [nws, om, owm, vc] = await Promise.all([
      fetchNWS(lat, lon),
      fetchOpenMeteo(lat, lon),
      fetchOpenWeather(lat, lon),
      fetchVisualCrossing(lat, lon),
    ]);

    const readings = [nws, om, owm, vc].filter(Boolean);
    if(!readings.length){
      res.status(503).json({ error: "Couldn't reach the weather sources right now. Try again in a moment." });
      return;
    }

    const { avg, trimmedIds, usedCount } = blend(readings);
    const payload = {
      temperature: Math.round(avg),
      placeName,
      sources: readings.map(r => ({
        source: r.source,
        label: r.label,
        temp: Math.round(r.temp),
        trimmed: trimmedIds.has(r),
      })),
      blended: readings.length > 1,
      sourcesUsed: usedCount,
    };

    cacheSet(cacheKey, payload);
    res.status(200).json({ ...payload, cached: false });
  }catch(err){
    res.status(500).json({ error: err.message || "Something went wrong" });
  }
}
