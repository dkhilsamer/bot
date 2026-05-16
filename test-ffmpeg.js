const ChildProcess = require('child_process');
const sources = [() => {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    return ffmpegStatic.path || ffmpegStatic;
  } catch (e) {
    console.error('require(ffmpeg-static) failed:', e.message);
    return null;
  }
}, 'ffmpeg', 'avconv', './ffmpeg', './avconv'];

for (let source of sources) {
  try {
    if (typeof source === 'function') source = source();
    if (!source) continue;
    console.log('Testing source:', source);
    const result = ChildProcess.spawnSync(source, ['-h'], { windowsHide: true });
    if (result.error) {
        console.log('  Result error:', result.error.message);
        throw result.error;
    }
    console.log('  Success! Command found.');
    process.exit(0);
  } catch (error) {
    console.log('  Source failed.');
  }
}
console.log('All sources failed.');
