// ==============================================================================
// Political Sphere — Validate-CI Safe PATH
// ------------------------------------------------------------------------------
// Purpose:
//   Provide a fixed, non-writable PATH for spawning trusted binaries.
// ==============================================================================

import fs from 'node:fs';

const SAFE_PATH_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

function isDirWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (err) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return false;
    }
    throw err;
  }
}

export function getSafePathEnv() {
  for (const dir of SAFE_PATH_DIRS) {
    let stat;
    try {
      stat = fs.statSync(dir);
    } catch (err) {
      if (err?.code === 'ENOENT') {
        throw new Error(`PATH entry does not exist: ${dir}`);
      }
      throw new Error(`PATH entry cannot be statted: ${dir}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`PATH entry is not a directory: ${dir}`);
    }
    if (isDirWritable(dir)) {
      throw new Error(`PATH entry must be non-writable: ${dir}`);
    }
  }
  return SAFE_PATH_DIRS.join(':');
}
