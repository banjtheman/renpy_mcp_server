/**
 * Ren'Py SDK download and extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Ren'Py version to download
const RENPY_VERSION = '8.4.1';

// Platform-specific SDK URLs
const SDK_URLS: Record<string, string> = {
  darwin: `https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-sdk.tar.bz2`,
  linux: `https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-sdk.tar.bz2`,
  win32: `https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-sdk.zip`,
};

// Web support URL (same for all platforms)
const WEB_SUPPORT_URL = `https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-web.zip`;

/**
 * Check if Ren'Py SDK is ready with web support
 */
export function isSDKReady(sdkDir: string): boolean {
  // Check for SDK directory
  if (!fs.existsSync(sdkDir)) {
    return false;
  }

  // Check for launcher directory (core SDK component)
  const launcherDir = path.join(sdkDir, 'launcher');
  if (!fs.existsSync(launcherDir)) {
    return false;
  }

  // Check for web support - handle both nested (web/web/) and flat (web/) structures
  const webDir = path.join(sdkDir, 'web');
  if (!fs.existsSync(webDir)) {
    return false;
  }

  // Check for essential web files in both possible locations
  const essentialFiles = ['index.html', 'renpy.js'];

  // Try flat structure first (web/index.html)
  let webFilesDir = webDir;
  if (!fs.existsSync(path.join(webDir, 'index.html'))) {
    // Try nested structure (web/web/index.html)
    const nestedWebDir = path.join(webDir, 'web');
    if (fs.existsSync(path.join(nestedWebDir, 'index.html'))) {
      webFilesDir = nestedWebDir;
    } else {
      return false;
    }
  }

  // Verify essential files exist
  for (const file of essentialFiles) {
    if (!fs.existsSync(path.join(webFilesDir, file))) {
      return false;
    }
  }

  return true;
}

/**
 * Download and extract Ren'Py SDK with web support
 */
export async function downloadRenpySDK(
  sdkDir: string,
  dataDir: string,
  log: (msg: string) => void
): Promise<void> {
  const platform = os.platform();
  const sdkUrl = SDK_URLS[platform];

  if (!sdkUrl) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Clean up existing SDK
  if (fs.existsSync(sdkDir)) {
    log('Removing existing SDK...');
    fs.rmSync(sdkDir, { recursive: true });
  }

  // Create SDK directory
  fs.mkdirSync(sdkDir, { recursive: true });

  // Download SDK
  const sdkArchive = path.join(
    dataDir,
    platform === 'win32' ? 'renpy-sdk.zip' : 'renpy-sdk.tar.bz2'
  );

  log(`Downloading Ren'Py SDK ${RENPY_VERSION}...`);
  await downloadFile(sdkUrl, sdkArchive, (progress) => {
    if (progress % 10 === 0) {
      log(`  SDK download: ${progress}%`);
    }
  });

  // Extract SDK
  log('Extracting SDK (this may take a minute)...');
  await extractArchive(sdkArchive, dataDir, platform);

  // The SDK extracts to renpy-VERSION-sdk/, rename to our sdkDir
  const extractedDir = path.join(dataDir, `renpy-${RENPY_VERSION}-sdk`);
  if (fs.existsSync(extractedDir) && extractedDir !== sdkDir) {
    // Move contents to sdkDir
    const items = fs.readdirSync(extractedDir);
    for (const item of items) {
      const src = path.join(extractedDir, item);
      const dest = path.join(sdkDir, item);
      fs.renameSync(src, dest);
    }
    fs.rmSync(extractedDir, { recursive: true });
  }

  // Clean up archive
  fs.unlinkSync(sdkArchive);

  // Download web support
  const webZip = path.join(dataDir, 'renpy-web.zip');
  log(`Downloading Ren'Py Web Support...`);
  await downloadFile(WEB_SUPPORT_URL, webZip, (progress) => {
    if (progress % 10 === 0) {
      log(`  Web support download: ${progress}%`);
    }
  });

  // Extract web support
  log('Extracting web support...');
  const webDir = path.join(sdkDir, 'web');
  fs.mkdirSync(webDir, { recursive: true });
  await extractZip(webZip, webDir);

  // Clean up
  fs.unlinkSync(webZip);

  log(`Ren'Py SDK ${RENPY_VERSION} installed successfully!`);
}

/**
 * Download a file with progress callback
 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const fetch = (await import('node-fetch')).default;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  let downloadedBytes = 0;
  let lastProgress = 0;

  const fileStream = createWriteStream(destPath);

  // Create a transform stream to track progress
  const body = response.body;
  if (!body) {
    throw new Error('No response body');
  }

  return new Promise((resolve, reject) => {
    body.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (totalBytes > 0 && onProgress) {
        const progress = Math.floor((downloadedBytes / totalBytes) * 100);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress(progress);
        }
      }
    });

    body.pipe(fileStream);
    body.on('error', reject);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });
}

/**
 * Extract an archive (tar.bz2 or zip)
 */
async function extractArchive(
  archivePath: string,
  destDir: string,
  platform: string
): Promise<void> {
  if (platform === 'win32' || archivePath.endsWith('.zip')) {
    await extractZip(archivePath, destDir);
  } else {
    // Use tar command for .tar.bz2
    await execAsync(`tar -xjf "${archivePath}" -C "${destDir}"`);
  }
}

/**
 * Extract a zip file
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const unzipper = await import('unzipper');

  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destDir }))
      .on('close', resolve)
      .on('error', reject);
  });
}

/**
 * Get the path to the Ren'Py executable
 */
export function getRenpyExecutable(sdkDir: string): string | null {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS: Try app bundle first
    const appBundles = ['renpy.app', "Ren'Py.app"];
    for (const app of appBundles) {
      const execPath = path.join(sdkDir, app, 'Contents', 'MacOS', 'renpy');
      if (fs.existsSync(execPath)) {
        return execPath;
      }
    }
    // Fall back to shell script
    const shPath = path.join(sdkDir, 'renpy.sh');
    if (fs.existsSync(shPath)) {
      return shPath;
    }
  } else if (platform === 'win32') {
    const exePath = path.join(sdkDir, 'renpy.exe');
    if (fs.existsSync(exePath)) {
      return exePath;
    }
  } else {
    // Linux
    const shPath = path.join(sdkDir, 'renpy.sh');
    if (fs.existsSync(shPath)) {
      return shPath;
    }
  }

  return null;
}

/**
 * Get the launcher path
 */
export function getLauncherPath(sdkDir: string): string {
  return path.join(sdkDir, 'launcher');
}

/**
 * Get the web support directory path (handles nested structure)
 */
export function getWebSupportPath(sdkDir: string): string {
  const webDir = path.join(sdkDir, 'web');
  const nestedWebDir = path.join(webDir, 'web');

  // Check for nested structure first (web/web/)
  if (fs.existsSync(path.join(nestedWebDir, 'index.html'))) {
    return nestedWebDir;
  }

  // Fall back to flat structure (web/)
  return webDir;
}
