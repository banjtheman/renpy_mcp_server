/**
 * VisualSceneBuilder - Storyboard Tree View (Expanded Beats)
 *
 * Displays EVERY dialogue line, choice, and moment as its own card.
 * Shows the full story flow, not just labels.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { BeatCard } from './BeatCard';
import { BeatEditModal } from './BeatEditModal';
import type { SceneNode, SceneEdge, ScriptGraph } from '../../../lib/story-types';
import { type StoryBeat, type BeatConnection, expandScenesIntoBeats } from './visual-builder-types';

// ============================================================================
// Asset Types
// ============================================================================

interface CharacterAsset {
  name: string;
  emotions: Array<{ emotion: string; base64: string; mimeType: string }>;
}

interface BackgroundAsset {
  name: string;
  path: string;
  base64: string;
  mimeType: string;
}

// ============================================================================
// Component Props
// ============================================================================

interface VisualSceneBuilderProps {
  projectName: string;
  onSendToClaude: (prompt: string) => void;
  app: {
    callServerTool: (params: { name: string; arguments: Record<string, unknown> }) => Promise<{
      structuredContent?: unknown;
    }>;
  };
  backgrounds?: BackgroundAsset[];
  characters?: CharacterAsset[];
}

// ============================================================================
// Layout Calculation for Beats
// ============================================================================

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  level: number;
  column: number;
}

function calculateBeatLayout(
  beats: StoryBeat[],
  connections: BeatConnection[]
): Map<string, LayoutNode> {
  const layout = new Map<string, LayoutNode>();
  const beatSet = new Set(beats.map((b) => b.id));

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const beat of beats) {
    outgoing.set(beat.id, []);
    incoming.set(beat.id, []);
  }

  for (const conn of connections) {
    if (beatSet.has(conn.sourceId) && beatSet.has(conn.targetId)) {
      outgoing.get(conn.sourceId)?.push(conn.targetId);
      incoming.get(conn.targetId)?.push(conn.sourceId);
    }
  }

  // Find root beats (no incoming connections)
  const roots = beats.filter((b) => (incoming.get(b.id)?.length || 0) === 0);

  // BFS to assign levels
  const levels = new Map<string, number>();
  const queue: { id: string; level: number }[] = [];

  for (const root of roots) {
    queue.push({ id: root.id, level: 0 });
    levels.set(root.id, 0);
  }

  if (roots.length === 0 && beats.length > 0) {
    queue.push({ id: beats[0].id, level: 0 });
    levels.set(beats[0].id, 0);
  }

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;

    for (const targetId of outgoing.get(id) || []) {
      if (!levels.has(targetId)) {
        levels.set(targetId, level + 1);
        queue.push({ id: targetId, level: level + 1 });
      }
    }
  }

  // Assign any unvisited
  for (const beat of beats) {
    if (!levels.has(beat.id)) {
      levels.set(beat.id, 0);
    }
  }

  // Group by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels.entries()) {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(id);
  }

  // Card dimensions - smaller for beats
  const cardWidth = 200;
  const cardHeight = 120;
  const horizontalGap = 30;
  const verticalGap = 40;

  const maxLevel = Math.max(...Array.from(levels.values()), 0);

  for (let level = 0; level <= maxLevel; level++) {
    const beatsAtLevel = levelGroups.get(level) || [];
    const levelWidth = beatsAtLevel.length * cardWidth + (beatsAtLevel.length - 1) * horizontalGap;

    beatsAtLevel.forEach((id, column) => {
      const x = column * (cardWidth + horizontalGap) - levelWidth / 2 + cardWidth / 2;
      const y = level * (cardHeight + verticalGap);

      layout.set(id, { id, x, y, level, column });
    });
  }

  return layout;
}

// ============================================================================
// Main Component
// ============================================================================

export function VisualSceneBuilder({
  projectName,
  onSendToClaude,
  app,
  backgrounds = [],
  characters = [],
}: VisualSceneBuilderProps) {
  // Raw scene data
  const [scenes, setScenes] = useState<Map<string, SceneNode>>(new Map());
  const [edges, setEdges] = useState<SceneEdge[]>([]);

  // Expanded beats
  const [beats, setBeats] = useState<StoryBeat[]>([]);
  const [connections, setConnections] = useState<BeatConnection[]>([]);

  // UI state
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // Data Loading
  // ============================================================================

  const loadGraph = useCallback(async () => {
    if (!projectName) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await app.callServerTool({
        name: 'get_script_graph',
        arguments: { projectName },
      });

      if (result.structuredContent) {
        const content = result.structuredContent as ScriptGraph | { error: string };
        if ('error' in content && typeof content.error === 'string') {
          setError(content.error);
          setScenes(new Map());
          setEdges([]);
          setBeats([]);
          setConnections([]);
        } else {
          const graph = content as ScriptGraph;

          const sceneMap = new Map<string, SceneNode>();
          for (const node of graph.nodes) {
            sceneMap.set(node.id, node);
          }
          setScenes(sceneMap);
          setEdges(graph.edges);

          // Expand into beats
          const { beats: expandedBeats, connections: beatConnections } = expandScenesIntoBeats(
            sceneMap,
            graph.edges
          );
          setBeats(expandedBeats);
          setConnections(beatConnections);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, [projectName, app]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // ============================================================================
  // Layout
  // ============================================================================

  const layout = useMemo(() => calculateBeatLayout(beats, connections), [beats, connections]);

  const bounds = useMemo(() => {
    if (layout.size === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    for (const pos of layout.values()) {
      minX = Math.min(minX, pos.x - 100);
      maxX = Math.max(maxX, pos.x + 100);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + 120);
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX + 60,
      height: maxY - minY + 60,
    };
  }, [layout]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleBeatClick = useCallback((beatId: string) => {
    setSelectedBeatId(beatId);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedBeatId(null);
    loadGraph();
  }, [loadGraph]);

  const handleSendToClaude = useCallback(
    (prompt: string) => {
      onSendToClaude(prompt);
      setTimeout(() => loadGraph(), 1000);
    },
    [onSendToClaude, loadGraph]
  );

  // ============================================================================
  // Selected Beat & Scene
  // ============================================================================

  const selectedBeat = selectedBeatId ? beats.find((b) => b.id === selectedBeatId) : null;
  const selectedScene = selectedBeat ? scenes.get(selectedBeat.sourceLabel) : null;

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="visual-scene-builder visual-builder-loading">
        <div className="loading-spinner">
          <div className="ink-swirl" />
          <p>Loading story...</p>
        </div>
      </div>
    );
  }

  if (beats.length === 0 && !error) {
    return (
      <div className="visual-scene-builder visual-builder-empty">
        <div className="empty-state">
          <div className="empty-icon">&#128214;</div>
          <h3>No Story Yet</h3>
          <p>Create your first scene to start building your visual novel.</p>
          <button
            className="btn-primary"
            onClick={() =>
              onSendToClaude(
                `Create the first scene for my visual novel project "${projectName}". Include a background, at least one character, and some dialogue.`
              )
            }
          >
            Ask Claude to Write a Scene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="visual-scene-builder">
      {/* Toolbar */}
      <div className="storyboard-toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={loadGraph} title="Refresh">
            &#8635; Refresh
          </button>
        </div>
        <div className="toolbar-center">
          <span className="toolbar-info">
            {beats.length} beat{beats.length !== 1 ? 's' : ''} &middot;{' '}
            {scenes.size} scene{scenes.size !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="toolbar-right">
          <button
            className="toolbar-btn toolbar-btn-primary"
            onClick={() =>
              onSendToClaude(
                `I'm working on project "${projectName}" which has ${beats.length} story beats across ${scenes.size} scenes. Please suggest what I should add next.`
              )
            }
          >
            &#10024; Ask Claude
          </button>
        </div>
      </div>

      {/* Storyboard Canvas */}
      <div className="storyboard-viewport" ref={viewportRef}>
        <div
          className="storyboard-canvas"
          style={{
            width: bounds.width,
            height: bounds.height,
            position: 'relative',
          }}
        >
          {/* SVG for arrows */}
          <svg
            className="storyboard-arrows"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="var(--ink-ghost)" />
              </marker>
              <marker
                id="arrowhead-choice"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="var(--accent-gold)" />
              </marker>
            </defs>

            {connections.map((conn) => {
              const sourcePos = layout.get(conn.sourceId);
              const targetPos = layout.get(conn.targetId);

              if (!sourcePos || !targetPos) return null;

              const offsetX = -bounds.minX + 30;
              const offsetY = -bounds.minY + 30;

              const x1 = sourcePos.x + offsetX;
              const y1 = sourcePos.y + offsetY + 110;
              const x2 = targetPos.x + offsetX;
              const y2 = targetPos.y + offsetY;

              const midY = (y1 + y2) / 2;
              const isChoiceEdge = conn.choiceIndex !== undefined;

              return (
                <path
                  key={conn.id}
                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                  fill="none"
                  stroke={isChoiceEdge ? 'var(--accent-gold)' : 'var(--ink-ghost)'}
                  strokeWidth={isChoiceEdge ? 2 : 1.5}
                  markerEnd={isChoiceEdge ? 'url(#arrowhead-choice)' : 'url(#arrowhead)'}
                  opacity={isChoiceEdge ? 0.8 : 0.5}
                />
              );
            })}
          </svg>

          {/* Beat Cards */}
          {beats.map((beat) => {
            const pos = layout.get(beat.id);
            if (!pos) return null;

            const offsetX = -bounds.minX + 30;
            const offsetY = -bounds.minY + 30;

            return (
              <div
                key={beat.id}
                className="beat-card-wrapper"
                style={{
                  position: 'absolute',
                  left: pos.x + offsetX - 100,
                  top: pos.y + offsetY,
                  width: 200,
                }}
              >
                <BeatCard
                  beat={beat}
                  backgrounds={backgrounds}
                  characters={characters}
                  isSelected={selectedBeatId === beat.id}
                  onClick={() => handleBeatClick(beat.id)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {selectedBeat && selectedScene && (
        <BeatEditModal
          beat={selectedBeat}
          scene={selectedScene.data}
          backgrounds={backgrounds}
          characters={characters}
          onClose={handleCloseModal}
          onSendToClaude={handleSendToClaude}
          projectName={projectName}
        />
      )}

      {/* Error */}
      {error && (
        <div className="visual-builder-error">
          <span className="error-icon">&#9888;</span>
          <span className="error-text">{error}</span>
          <button onClick={loadGraph}>Retry</button>
        </div>
      )}
    </div>
  );
}

export default VisualSceneBuilder;
