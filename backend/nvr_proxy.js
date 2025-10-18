// express-hikvision-hls-proxy.js
// Ready-to-use Node.js + Express middleware to proxy Hikvision RTSP playback -> HLS
// Requirements:
//  - ffmpeg installed and available in PATH
//  - node 16+
// Install dependencies: npm i express uuid rimraf basic-auth helmet morgan

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const rimraf = require('rimraf');
const basicAuth = require('basic-auth');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
app.use(helmet());
app.use(morgan('combined'));

// CONFIG - change to match your environment
const NVR_USER = process.env.NVR_USER || 'admin';
const NVR_PASS = process.env.NVR_PASS || 'Eduvision124';
const NVR_IP = process.env.NVR_IP || '192.168.8.7';
const NVR_RTSP_PORT = process.env.NVR_RTSP_PORT || 554;
const STREAM_TTL_SECONDS = parseInt(process.env.STREAM_TTL_SECONDS || '120'); // how long to keep generated hls files
const HLS_SEGMENT_SECONDS = parseInt(process.env.HLS_SEGMENT_SECONDS || '2');
const HLS_LIST_SIZE = parseInt(process.env.HLS_LIST_SIZE || '5');

// directory to hold temporary HLS outputs
const STREAMS_ROOT = path.join(os.tmpdir(), 'hikvision_hls_streams');
if (!fs.existsSync(STREAMS_ROOT)) fs.mkdirSync(STREAMS_ROOT, { recursive: true });

// in-memory map of active streams
const streams = new Map();

// simple Basic Auth for the API (optional)
function checkApiAuth(req, res, next) {
  // If you prefer token-based auth, replace this
  const user = basicAuth(req);
  if (!user || user.name !== (process.env.API_USER || 'api') || user.pass !== (process.env.API_PASS || 'api_pass')) {
    res.set('WWW-Authenticate', 'Basic realm="Playback API"');
    return res.status(401).send('Unauthorized');
  }
  next();
}

// Build RTSP playback URL for Hikvision NVR using time range and channel
function buildRtspPlaybackUrl({ channel = 1, startTimeIso, endTimeIso }) {
  // channel mapping to track: main stream usually 101, substream 102, channel N => (100*ch + 1)
  const track = `${100 * channel + 1}`; // 101, 201, ...
  // Some firmwares accept query params starttime/endtime in format YYYYMMDDThhmmssZ or YYYY-MM-DDTHH:MM:SSZ
  // We'll use YYYYMMDDThhmmssZ
  function toHikTs(iso) {
    // iso expected like 2025-09-23T14:20:00Z or local ISO
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }

  const start = toHikTs(startTimeIso);
  const end = toHikTs(endTimeIso);

  // URL with credentials (note: for production, avoid embedding credentials in URLs; prefer authenticated proxy)
  const rtsp = `rtsp://${encodeURIComponent(NVR_USER)}:${encodeURIComponent(NVR_PASS)}@${NVR_IP}:${NVR_RTSP_PORT}/Streaming/tracks/${track}?starttime=${start}&endtime=${end}`;
  return rtsp;
}

// Spawn ffmpeg to produce HLS into a folder
function spawnFfmpegToHls(rtspUrl, outDir, options = {}) {
  const playlist = 'index.m3u8';
  const segmentTime = options.segmentTime || HLS_SEGMENT_SECONDS;
  const listSize = options.listSize || HLS_LIST_SIZE;

  // ensure outDir exists
  fs.mkdirSync(outDir, { recursive: true });

  const args = [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-c:v', 'copy', // copy if codec compatible; change to libx264 if transcoding needed
    '-c:a', 'aac',
    '-ac', '1',
    '-f', 'hls',
    '-hls_time', String(segmentTime),
    '-hls_list_size', String(listSize),
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(outDir, 'segment%03d.ts'),
    path.join(outDir, playlist)
  ];

  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  ff.stderr.on('data', (chunk) => {
    console.log(`[ffmpeg ${outDir}] ${chunk.toString()}`);
  });

  ff.on('close', (code, signal) => {
    console.log(`ffmpeg exited ${code} ${signal} -> ${outDir}`);
  });

  return ff;
}

// Create stream: returns object with id and url where HLS will be served
function createStream({ startIso, endIso, channel = 1 }) {
  const id = uuidv4();
  const outDir = path.join(STREAMS_ROOT, id);
  const rtsp = buildRtspPlaybackUrl({ channel, startTimeIso: startIso, endTimeIso: endIso });
  const ffProc = spawnFfmpegToHls(rtsp, outDir, {});

  const expiresAt = Date.now() + STREAM_TTL_SECONDS * 1000;
  const streamObj = { id, outDir, rtProc: ffProc, rtsp, expiresAt };
  streams.set(id, streamObj);

  // schedule cleanup
  setTimeout(() => {
    const s = streams.get(id);
    if (!s) return;
    // kill ffmpeg
    try { s.rtProc.kill('SIGKILL'); } catch (e) {}
    rimraf(s.outDir, () => {});
    streams.delete(id);
    console.log(`Cleaned stream ${id}`);
  }, STREAM_TTL_SECONDS * 1000 + 5000);

  return { id, url: `/streams/${id}/index.m3u8` };
}

// API: create playback HLS from a timestamp
// Query params: time (epoch seconds) or iso (ISO string), channel (int), prebufferSeconds (int)
app.get('/api/playback', checkApiAuth, (req, res) => {
  try {
    const { time, iso, channel = '1', prebufferSeconds = '10' } = req.query;

    let ts = null;
    if (iso) ts = new Date(iso);
    else if (time) ts = new Date(Number(time) * 1000);
    else return res.status(400).json({ error: 'time or iso required' });

    const start = new Date(ts.getTime() - Number(prebufferSeconds)*1000);
    const end = new Date(ts.getTime() + Number(prebufferSeconds)*1000);

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const stream = createStream({ startIso, endIso, channel: Number(channel) });

    // return absolute URL
    const host = req.get('host');
    const protocol = req.protocol;
    const playbackUrl = `${protocol}://${host}${stream.url}`;

    return res.json({ id: stream.id, playbackUrl, rtsp: streams.get(stream.id).rtsp });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to create playback' });
  }
});

// Serve generated HLS files statically
app.use('/streams', express.static(STREAMS_ROOT, { index: false }));

// Simple health
app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hikvision HLS proxy listening on ${PORT}`);
  console.log(`Streams root: ${STREAMS_ROOT}`);
});

// Graceful cleanup on exit
process.on('SIGINT', () => process.exit(0));
process.on('exit', () => {
  for (const [id, s] of streams) {
    try { s.rtProc.kill('SIGKILL'); } catch (e) {}
    rimraf.sync(s.outDir);
  }
});
