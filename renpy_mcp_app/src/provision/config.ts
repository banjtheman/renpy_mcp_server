/**
 * Configuration management for RenPy Studio
 */

import * as fs from 'fs';

export interface Config {
  geminiApiKey: string;
  dataDir?: string;
  venvDir?: string;
  sdkDir?: string;
  workspaceDir?: string;
}

/**
 * Load configuration from file
 */
export function getConfig(configPath: string): Config | null {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as Config;
    }
  } catch {
    // Config file doesn't exist or is invalid
  }
  return null;
}

/**
 * Save configuration to file
 */
export function saveConfig(configPath: string, config: Config): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
