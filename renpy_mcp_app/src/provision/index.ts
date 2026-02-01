/**
 * Auto-provisioning module for RenPy Studio
 *
 * Handles first-run setup:
 * 1. Create data directory (~/.renpy-studio/)
 * 2. Create Python venv with required packages
 * 3. Download Ren'Py SDK with web support
 */

import { createVenv, isVenvReady } from './venv.js';
import { downloadRenpySDK, isSDKReady } from './renpy-sdk.js';
import { getConfig, saveConfig, type Config } from './config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Data directory location
export const DATA_DIR = path.join(os.homedir(), '.renpy-studio');
export const VENV_DIR = path.join(DATA_DIR, '.venv');
export const SDK_DIR = path.join(DATA_DIR, 'renpy-sdk');
export const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Get the package directory (where python/ scripts are bundled)
export const PACKAGE_DIR = path.resolve(
  new URL('.', import.meta.url).pathname,
  '../../..'
);

export interface ProvisionOptions {
  onProgress?: (message: string) => void;
  force?: boolean;
}

export interface ProvisionResult {
  success: boolean;
  error?: string;
  config: Config;
}

/**
 * Ensure the RenPy Studio environment is fully provisioned
 */
export async function ensureEnvironment(
  options: ProvisionOptions = {}
): Promise<ProvisionResult> {
  const log = options.onProgress || console.error;

  try {
    // Step 0: Check for required GEMINI_API_KEY
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return {
        success: false,
        error:
          'GEMINI_API_KEY environment variable is required.\n\n' +
          'Add it to your Claude Desktop MCP config:\n' +
          '{\n' +
          '  "renpy-studio": {\n' +
          '    "command": "npx",\n' +
          '    "args": ["-y", "renpy-studio", "--stdio"],\n' +
          '    "env": {\n' +
          '      "GEMINI_API_KEY": "your-api-key-here"\n' +
          '    }\n' +
          '  }\n' +
          '}\n\n' +
          'Get your API key at: https://aistudio.google.com/apikey',
        config: { geminiApiKey: '' },
      };
    }

    // Step 1: Create data directory
    log('Checking RenPy Studio data directory...');
    if (!fs.existsSync(DATA_DIR)) {
      log(`Creating ${DATA_DIR}...`);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Create workspace directory
    if (!fs.existsSync(WORKSPACE_DIR)) {
      fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    }

    // Step 2: Create Python venv
    if (options.force || !isVenvReady(VENV_DIR)) {
      log('Setting up Python environment...');
      await createVenv(VENV_DIR, PACKAGE_DIR, log);
      log('Python environment ready!');
    } else {
      log('Python environment already configured.');
    }

    // Step 3: Download Ren'Py SDK
    if (options.force || !isSDKReady(SDK_DIR)) {
      log("Downloading Ren'Py SDK (this may take a few minutes)...");
      await downloadRenpySDK(SDK_DIR, DATA_DIR, log);
      log("Ren'Py SDK ready!");
    } else {
      log("Ren'Py SDK already installed.");
    }

    // Step 4: Save config
    const config: Config = {
      geminiApiKey,
      dataDir: DATA_DIR,
      venvDir: VENV_DIR,
      sdkDir: SDK_DIR,
      workspaceDir: WORKSPACE_DIR,
    };
    saveConfig(CONFIG_FILE, config);

    log('RenPy Studio is ready!');
    return { success: true, config };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Provisioning failed: ${message}`,
      config: { geminiApiKey: '' },
    };
  }
}

/**
 * Check if environment is already provisioned
 */
export function isProvisioned(): boolean {
  return (
    fs.existsSync(DATA_DIR) &&
    isVenvReady(VENV_DIR) &&
    isSDKReady(SDK_DIR) &&
    !!process.env.GEMINI_API_KEY
  );
}
