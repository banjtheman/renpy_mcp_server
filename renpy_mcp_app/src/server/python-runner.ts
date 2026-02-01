/**
 * Python script runner
 *
 * Spawns Python scripts from the bundled python/ directory
 * using the managed virtual environment.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import { VENV_DIR, SDK_DIR, WORKSPACE_DIR, DATA_DIR } from '../provision/index.js';
import { getPythonPath, getVenvEnv } from '../provision/venv.js';

// Get the python scripts directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// From src/server/ go up 2 levels to reach renpy_mcp_app/, then into python/
const PYTHON_DIR = path.resolve(__dirname, '../..', 'python');

/**
 * Run a Python script and return JSON result
 */
export async function runPythonScript(
  scriptName: string,
  args: string[]
): Promise<any> {
  const scriptPath = path.join(PYTHON_DIR, scriptName);

  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found: ${scriptName}`);
  }

  // Get Python executable from venv
  const pythonPath = getPythonPath(VENV_DIR);
  if (!fs.existsSync(pythonPath)) {
    throw new Error('Python venv not ready. Please restart the server.');
  }

  // Build environment
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...getVenvEnv(VENV_DIR),
    // Pass configuration to Python scripts
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    RENPY_SDK_PATH: SDK_DIR,
    RENPY_MCP_WORKSPACE: WORKSPACE_DIR,
    RENPY_STUDIO_DATA_DIR: DATA_DIR,
    // Headless mode for Ren'Py builds
    SDL_VIDEODRIVER: 'dummy',
    SDL_AUDIODRIVER: 'dummy',
    RENPY_FORCE_SOFTWARE: '1',
    RENPY_DISABLE_UPDATE: '1',
    RENPY_DISABLE_JOYSTICK: '1',
  };

  return new Promise((resolve, reject) => {
    const process = spawn(pythonPath, [scriptPath, ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log Python errors/warnings to console
      console.error(`[Python] ${data.toString().trim()}`);
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python script "${scriptName}" exited with code ${code}: ${stderr || stdout}`
          )
        );
        return;
      }

      // Try to parse JSON output
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        // If not JSON, return raw output
        resolve({ output: stdout.trim() });
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to run Python script: ${error.message}`));
    });
  });
}

/**
 * Run a Python script with streaming output callback
 */
export async function runPythonScriptStreaming(
  scriptName: string,
  args: string[],
  onOutput: (line: string) => void
): Promise<any> {
  const scriptPath = path.join(PYTHON_DIR, scriptName);

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found: ${scriptName}`);
  }

  const pythonPath = getPythonPath(VENV_DIR);
  if (!fs.existsSync(pythonPath)) {
    throw new Error('Python venv not ready. Please restart the server.');
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...getVenvEnv(VENV_DIR),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    RENPY_SDK_PATH: SDK_DIR,
    RENPY_MCP_WORKSPACE: WORKSPACE_DIR,
    RENPY_STUDIO_DATA_DIR: DATA_DIR,
    SDL_VIDEODRIVER: 'dummy',
    SDL_AUDIODRIVER: 'dummy',
    RENPY_FORCE_SOFTWARE: '1',
    RENPY_DISABLE_UPDATE: '1',
    RENPY_DISABLE_JOYSTICK: '1',
  };

  return new Promise((resolve, reject) => {
    const process = spawn(pythonPath, [scriptPath, ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let lastLine = '';

    process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          onOutput(line);
          lastLine = line;
        }
      }
    });

    process.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          onOutput(`[stderr] ${line}`);
        }
      }
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Script exited with code ${code}`));
        return;
      }

      // Try to parse last line as JSON result
      try {
        const result = JSON.parse(lastLine);
        resolve(result);
      } catch {
        resolve({ success: true });
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to run script: ${error.message}`));
    });
  });
}
