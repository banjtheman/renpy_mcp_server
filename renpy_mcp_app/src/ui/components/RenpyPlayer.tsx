/**
 * RenpyPlayer - Renders Ren'Py games directly in React (no iframe!)
 *
 * This component bypasses CSP restrictions by:
 * 1. Loading all game files via MCP tools (base64)
 * 2. Converting to Blob URLs
 * 3. Executing Emscripten/Ren'Py directly in the page
 *
 * Similar to how react-reader renders EPUBs without iframes.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface RenpyPlayerProps {
  projectName: string;
  app: any; // MCP App instance
  onError?: (error: string) => void;
  onReady?: () => void;
}

interface LoadingState {
  phase: 'idle' | 'loading' | 'initializing' | 'running' | 'error';
  message: string;
  progress?: number;
}

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert base64 to Blob URL
function base64ToBlobUrl(base64: string, mimeType: string): string {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const blob = new Blob([arrayBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

export function RenpyPlayer({ projectName, app, onError, onReady }: RenpyPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    phase: 'idle',
    message: 'Ready to load'
  });
  const blobUrlsRef = useRef<string[]>([]);
  const cleanedUpRef = useRef(false);

  // Cleanup blob URLs on unmount
  const cleanup = useCallback(() => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    console.log('[RenpyPlayer] Cleaning up...');
    blobUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore
      }
    });
    blobUrlsRef.current = [];

    // Clean up global Module
    if ((window as any).Module) {
      try {
        // Signal abort to Emscripten
        if ((window as any).Module.abort) {
          (window as any).Module.abort();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      delete (window as any).Module;
    }

    // Restore original fetch if we overrode it
    if ((window as any)._renpyOriginalFetch) {
      (window as any).fetch = (window as any)._renpyOriginalFetch;
      delete (window as any)._renpyOriginalFetch;
    }

    // Clean up other Ren'Py globals
    const renpyGlobals = [
      'FS', 'IDBFS', 'renpy_exec', 'renpy_get', 'renpy_set',
      'progress', 'presplashEnd', 'atExit', 'loadCache', 'clearCache',
      'startInput', 'endInput', 'fetchFile', 'fetchFileResult',
      'isFullscreen', 'setFullscreen', 'FSDownload', 'onSavegamesImport',
      'onSavegamesExport', '_renpy_cmd_callback', '_renpy_cmd',
      'webglContextLost', 'webglContextRestored', 'inputResult',
      '_renpyGameZipBinary', 'gameZipURL'
    ];
    renpyGlobals.forEach(name => {
      try {
        delete (window as any)[name];
      } catch (e) {
        // Ignore
      }
    });
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Load and initialize the game
  const loadGame = useCallback(async () => {
    if (!app || !canvasRef.current || !containerRef.current) return;

    cleanedUpRef.current = false;
    setLoadingState({ phase: 'loading', message: 'Loading game files...' });

    try {
      // Step 1: Get all game files via MCP tool
      console.log('[RenpyPlayer] Fetching game bundle...');
      const result = await app.callServerTool({
        name: 'ui_get_game_bundle',
        arguments: { projectName },
      });

      if (result.structuredContent?.error) {
        throw new Error(result.structuredContent.error);
      }

      const { renpyJs, renpyPreJs, renpyWasm, renpyData, gameZip, sizes } = result.structuredContent;

      if (!renpyJs || !renpyPreJs || !renpyWasm || !gameZip) {
        throw new Error('Missing required game files');
      }

      console.log('[RenpyPlayer] Game bundle received:', {
        renpyJs: sizes?.renpyJs,
        renpyWasm: sizes?.renpyWasm,
        renpyData: sizes?.renpyData,
        gameZip: sizes?.gameZip,
      });

      setLoadingState({ phase: 'initializing', message: 'Initializing game engine...' });

      // Step 2: Convert base64 to ArrayBuffers (pass directly to Emscripten, no blob URLs!)
      // This bypasses connect-src CSP restrictions
      const wasmBinary = base64ToArrayBuffer(renpyWasm);
      const dataBinary = renpyData ? base64ToArrayBuffer(renpyData) : null;
      const gameZipBinary = base64ToArrayBuffer(gameZip);

      console.log('[RenpyPlayer] Converted to ArrayBuffers:', {
        wasmSize: wasmBinary.byteLength,
        dataSize: dataBinary?.byteLength,
        gameZipSize: gameZipBinary.byteLength,
      });

      // Step 3: Set up DOM elements that renpy-pre.js expects
      const container = containerRef.current;

      // Create status elements
      const statusDiv = document.createElement('div');
      statusDiv.id = 'statusDiv';
      statusDiv.className = 'hidden';
      statusDiv.innerHTML = `
        <div id="statusTextDiv"></div>
        <progress id="statusProgress" value="0" max="100"></progress>
      `;
      container.appendChild(statusDiv);

      // Create presplash
      const presplash = document.createElement('div');
      presplash.id = 'presplash';
      presplash.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;';
      presplash.textContent = 'Loading...';
      container.appendChild(presplash);

      // Create overlay div
      const overlayDiv = document.createElement('div');
      overlayDiv.id = 'overlayDiv';
      container.appendChild(overlayDiv);

      // Create context menu (minimal)
      const contextContainer = document.createElement('div');
      contextContainer.id = 'ContextContainer';
      contextContainer.innerHTML = `
        <a id="ContextButton" style="display:none;">&#8801;</a>
        <div id="ContextMenu" style="display:none;"></div>
      `;
      container.appendChild(contextContainer);

      // Create input div
      const inputDiv = document.createElement('div');
      inputDiv.id = 'inputDiv';
      inputDiv.className = 'hidden';
      inputDiv.innerHTML = `
        <form id="inputForm">
          <div id="inputPrompt"></div>
          <input id="inputText" type="text">
        </form>
      `;
      container.appendChild(inputDiv);

      // Step 4: Configure Emscripten Module
      const canvas = canvasRef.current;
      canvas.id = 'canvas';

      // Store game.zip binary for loading later
      const gameZipUint8 = new Uint8Array(gameZipBinary);
      (window as any)._renpyGameZipBinary = gameZipUint8;

      // Set a marker URL that we'll intercept
      const gameZipMarkerUrl = 'renpy-player://game.zip';
      (window as any).gameZipURL = gameZipMarkerUrl;

      // Override fetch to intercept game.zip request and return our data
      const originalFetch = window.fetch;
      (window as any).fetch = async function(url: RequestInfo | URL, options?: RequestInit) {
        const urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr === gameZipMarkerUrl || urlStr.endsWith('game.zip')) {
          console.log('[RenpyPlayer] Intercepted game.zip fetch, returning preloaded data');
          // Return a fake Response with our game.zip data
          const blob = new Blob([gameZipUint8], { type: 'application/zip' });
          return new Response(blob, {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': 'application/zip',
              'Content-Length': String(gameZipUint8.length),
            }
          });
        }

        // For other requests, use original fetch
        return originalFetch.call(window, url, options);
      };

      // Store original fetch for cleanup
      (window as any)._renpyOriginalFetch = originalFetch;

      // Configure Module with direct ArrayBuffer data (bypasses CSP!)
      (window as any).Module = {
        canvas: canvas,
        preRun: [],

        // Pass WASM binary directly - no fetch needed!
        wasmBinary: wasmBinary,

        // For .data file, use getPreloadedPackage
        // Note: remotePath may be empty string when locateFile returns '' for .data files
        // So we match by size instead (there's only one .data file)
        getPreloadedPackage: (remotePath: string, remoteSize: number) => {
          console.log('[RenpyPlayer] getPreloadedPackage:', remotePath, remoteSize, 'dataBinary size:', dataBinary?.byteLength);
          // Match by size since remotePath may be empty
          if (dataBinary && dataBinary.byteLength === remoteSize) {
            console.log('[RenpyPlayer] Returning preloaded .data file');
            return dataBinary;
          }
          // Also check if remotePath ends with .data (fallback)
          if (remotePath.endsWith('.data') && dataBinary) {
            console.log('[RenpyPlayer] Returning preloaded .data file (path match)');
            return dataBinary;
          }
          return null;
        },

        // Still need locateFile for other resources, but WASM is handled by wasmBinary
        locateFile: (path: string, prefix: string) => {
          console.log('[RenpyPlayer] locateFile:', path);
          // WASM is handled by wasmBinary, data by getPreloadedPackage
          // Return empty for these to prevent fetch attempts
          if (path.endsWith('.wasm') || path.endsWith('.data')) {
            return ''; // Won't be fetched due to wasmBinary/getPreloadedPackage
          }
          return prefix + path;
        },

        print: (text: string) => {
          console.log('[Ren\'Py]', text);
        },

        printErr: (text: string) => {
          console.warn('[Ren\'Py]', text);
        },

        onAbort: () => {
          console.error('[RenpyPlayer] Emscripten aborted');
          setLoadingState({ phase: 'error', message: 'Game engine aborted unexpectedly' });
        },

        onRuntimeInitialized: () => {
          console.log('[RenpyPlayer] Emscripten runtime initialized');
          setLoadingState({ phase: 'running', message: 'Game running' });
          onReady?.();
        },
      };

      console.log('[RenpyPlayer] Module configured, executing scripts...');

      // Step 5: Execute renpy-pre.js (sets up Module.preRun, UI handling, etc.)
      const preScript = document.createElement('script');
      preScript.textContent = atob(renpyPreJs);
      container.appendChild(preScript);

      console.log('[RenpyPlayer] renpy-pre.js executed');

      // Step 6: Execute renpy.js (the Emscripten runtime)
      // This needs to be loaded as a proper script for Emscripten to work
      const mainScript = document.createElement('script');
      mainScript.textContent = atob(renpyJs);
      mainScript.async = true;
      container.appendChild(mainScript);

      console.log('[RenpyPlayer] renpy.js executed');

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[RenpyPlayer] Error:', message);
      setLoadingState({ phase: 'error', message });
      onError?.(message);
    }
  }, [app, projectName, onError, onReady]);

  // Auto-load on mount
  useEffect(() => {
    if (app && loadingState.phase === 'idle') {
      loadGame();
    }
  }, [app, loadGame, loadingState.phase]);

  return (
    <div className="renpy-player" ref={containerRef}>
      {/* Loading overlay */}
      {loadingState.phase !== 'running' && (
        <div className="renpy-loading-overlay">
          {loadingState.phase === 'error' ? (
            <div className="renpy-error">
              <span className="renpy-error-icon">!</span>
              <p>{loadingState.message}</p>
              <button onClick={loadGame}>Retry</button>
            </div>
          ) : (
            <div className="renpy-loading">
              <div className="renpy-spinner"></div>
              <p>{loadingState.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Game canvas */}
      <canvas
        ref={canvasRef}
        className="renpy-canvas"
        onContextMenu={(e) => e.preventDefault()}
        tabIndex={-1}
      />

      <style>{`
        .renpy-player {
          position: relative;
          width: 100%;
          height: 100%;
          background: #000;
          overflow: hidden;
        }

        .renpy-canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .renpy-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .renpy-loading {
          text-align: center;
          color: #fff;
        }

        .renpy-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: renpy-spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes renpy-spin {
          to { transform: rotate(360deg); }
        }

        .renpy-error {
          text-align: center;
          color: #ff6b6b;
        }

        .renpy-error-icon {
          display: block;
          font-size: 48px;
          margin-bottom: 16px;
        }

        .renpy-error button {
          margin-top: 16px;
          padding: 8px 24px;
          background: #5c4a3d;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .renpy-error button:hover {
          background: #8b7355;
        }

        /* Hidden elements needed by renpy-pre.js */
        #statusDiv.hidden { display: none; }
        #statusDiv.visible {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.8);
          color: #fff;
          padding: 10px 20px;
          border-radius: 5px;
          z-index: 200;
        }
        #inputDiv.hidden { display: none; }
        #inputDiv.visible {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0,0,0,0.9);
          padding: 20px;
          border-radius: 8px;
          z-index: 200;
        }
        #inputText {
          width: 200px;
          padding: 8px;
          font-size: 16px;
        }
        #presplash {
          z-index: 50;
        }
      `}</style>
    </div>
  );
}

export default RenpyPlayer;
