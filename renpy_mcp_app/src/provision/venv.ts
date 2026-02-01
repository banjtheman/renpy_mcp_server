/**
 * Python virtual environment provisioning
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * Check if Python venv is ready with required packages
 */
export function isVenvReady(venvDir: string): boolean {
  // Check if venv directory exists
  if (!fs.existsSync(venvDir)) {
    return false;
  }

  // Check for pip executable (platform-specific)
  const pipPath =
    os.platform() === 'win32'
      ? path.join(venvDir, 'Scripts', 'pip.exe')
      : path.join(venvDir, 'bin', 'pip');

  if (!fs.existsSync(pipPath)) {
    return false;
  }

  // Check for marker file indicating successful setup
  const markerFile = path.join(venvDir, '.renpy-studio-ready');
  return fs.existsSync(markerFile);
}

/**
 * Create Python venv and install required packages
 */
export async function createVenv(
  venvDir: string,
  packageDir: string,
  log: (msg: string) => void
): Promise<void> {
  // Remove existing venv if present
  if (fs.existsSync(venvDir)) {
    log('Removing existing Python environment...');
    fs.rmSync(venvDir, { recursive: true });
  }

  // Find Python executable
  const pythonCmd = await findPython();
  log(`Using Python: ${pythonCmd}`);

  // Create venv
  log('Creating virtual environment...');
  await execAsync(`"${pythonCmd}" -m venv "${venvDir}"`);

  // Get pip path
  const pipPath =
    os.platform() === 'win32'
      ? path.join(venvDir, 'Scripts', 'pip.exe')
      : path.join(venvDir, 'bin', 'pip');

  // Upgrade pip first
  log('Upgrading pip...');
  await execAsync(`"${pipPath}" install --upgrade pip`);

  // Install requirements
  const requirementsPath = path.join(packageDir, 'python', 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    log('Installing Python packages (this may take a minute)...');
    log('  - google-genai (Gemini API)');
    log('  - pillow (image processing)');
    log('  - rembg (background removal)');
    log('  - onnxruntime (ML runtime)');

    try {
      await execAsync(`"${pipPath}" install -r "${requirementsPath}"`, {
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for pip output
      });
    } catch (error) {
      // Try installing packages individually if requirements file fails
      log('Trying individual package installation...');
      const packages = [
        'google-genai>=0.3.0',
        'pillow>=10.0.0',
        'rembg>=2.0.0',
        'onnxruntime>=1.16.0',
        'structlog>=24.1.0',
      ];

      for (const pkg of packages) {
        log(`  Installing ${pkg.split('>=')[0]}...`);
        try {
          await execAsync(`"${pipPath}" install "${pkg}"`, {
            maxBuffer: 50 * 1024 * 1024,
          });
        } catch (pkgError) {
          log(`  Warning: Failed to install ${pkg}, continuing...`);
        }
      }
    }
  } else {
    // Install packages directly if requirements.txt doesn't exist
    log('Installing Python packages directly...');
    const packages = [
      'google-genai',
      'pillow',
      'rembg',
      'onnxruntime',
      'structlog',
    ];

    for (const pkg of packages) {
      log(`  Installing ${pkg}...`);
      try {
        await execAsync(`"${pipPath}" install "${pkg}"`, {
          maxBuffer: 50 * 1024 * 1024,
        });
      } catch (pkgError) {
        log(`  Warning: Failed to install ${pkg}, continuing...`);
      }
    }
  }

  // Create marker file to indicate successful setup
  const markerFile = path.join(venvDir, '.renpy-studio-ready');
  fs.writeFileSync(markerFile, new Date().toISOString());

  log('Python environment setup complete!');
}

/**
 * Find a suitable Python executable
 */
async function findPython(): Promise<string> {
  const candidates =
    os.platform() === 'win32'
      ? ['python', 'python3', 'py -3']
      : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`);
      // Check for Python 3.x
      if (stdout.includes('Python 3')) {
        return cmd;
      }
    } catch {
      // Command not found, try next
    }
  }

  throw new Error(
    'Python 3 not found. Please install Python 3.8 or later from https://python.org'
  );
}

/**
 * Get the Python executable path from venv
 */
export function getPythonPath(venvDir: string): string {
  return os.platform() === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

/**
 * Get environment variables for running Python in the venv
 */
export function getVenvEnv(venvDir: string): Record<string, string> {
  const binDir =
    os.platform() === 'win32'
      ? path.join(venvDir, 'Scripts')
      : path.join(venvDir, 'bin');

  return {
    VIRTUAL_ENV: venvDir,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
  };
}
