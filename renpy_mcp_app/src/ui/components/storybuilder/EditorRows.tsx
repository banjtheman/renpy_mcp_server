/**
 * EditorRows - Table Row Components for Scene Editor
 *
 * Individual row components for editing scene elements:
 * - BackgroundRow: Background selection
 * - CharacterRow: Character name, emotion, position
 * - TextRow: Dialogue speaker and text
 * - ChoiceRow: Menu choice text and target
 */

import React, { useCallback } from 'react';
import type { CharacterState, DialogueLine, MenuChoice } from '../../../lib/story-types';

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
// Background Row
// ============================================================================

interface BackgroundRowProps {
  currentBg: string | undefined;
  availableBackgrounds: BackgroundAsset[];
  onChange: (bgName: string) => void;
  isModified?: boolean;
}

export function BackgroundRow({
  currentBg,
  availableBackgrounds,
  onChange,
  isModified = false,
}: BackgroundRowProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className={`editor-row editor-row-background ${isModified ? 'modified' : ''}`}>
      <div className="row-type">
        <span className="type-icon">{'\u{1F5BC}'}</span>
        <span className="type-label">Background</span>
      </div>
      <div className="row-content">
        <select value={currentBg || ''} onChange={handleChange} className="row-select">
          <option value="">-- None --</option>
          {availableBackgrounds.map((bg) => (
            <option key={bg.name} value={bg.name}>
              {bg.name}
            </option>
          ))}
        </select>
      </div>
      <div className="row-actions">
        {/* Empty for backgrounds */}
      </div>
    </div>
  );
}

// ============================================================================
// Character Row
// ============================================================================

interface CharacterRowProps {
  character: CharacterState;
  index: number;
  availableCharacters: CharacterAsset[];
  onChange: (changes: Partial<CharacterState>) => void;
  onRemove: () => void;
  isModified?: boolean;
}

export function CharacterRow({
  character,
  index,
  availableCharacters,
  onChange,
  onRemove,
  isModified = false,
}: CharacterRowProps) {
  // Get emotions for selected character
  const selectedCharAsset = availableCharacters.find(
    (c) => c.name.toLowerCase() === character.name.toLowerCase()
  );
  const availableEmotions = selectedCharAsset?.emotions || [];

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newName = e.target.value;
      // When changing character, reset emotion to first available
      const newCharAsset = availableCharacters.find(
        (c) => c.name.toLowerCase() === newName.toLowerCase()
      );
      const firstEmotion = newCharAsset?.emotions[0]?.emotion || 'neutral';
      onChange({ name: newName, emotion: firstEmotion });
    },
    [onChange, availableCharacters]
  );

  const handleEmotionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ emotion: e.target.value });
    },
    [onChange]
  );

  const handlePositionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ position: e.target.value as 'left' | 'center' | 'right' });
    },
    [onChange]
  );

  return (
    <div className={`editor-row editor-row-character ${isModified ? 'modified' : ''}`}>
      <div className="row-type">
        <span className="type-icon">{'\u{1F464}'}</span>
        <span className="type-label">Character</span>
      </div>
      <div className="row-content row-content-multi">
        {/* Name */}
        <select
          value={character.name}
          onChange={handleNameChange}
          className="row-select char-name-select"
          title="Character name"
        >
          <option value={character.name}>{character.name}</option>
          {availableCharacters
            .filter((c) => c.name.toLowerCase() !== character.name.toLowerCase())
            .map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
        </select>

        {/* Emotion */}
        <select
          value={character.emotion}
          onChange={handleEmotionChange}
          className="row-select char-emotion-select"
          title="Emotion"
        >
          {availableEmotions.length > 0 ? (
            availableEmotions.map((e) => (
              <option key={e.emotion} value={e.emotion}>
                {e.emotion}
              </option>
            ))
          ) : (
            <option value={character.emotion}>{character.emotion}</option>
          )}
        </select>

        {/* Position */}
        <select
          value={character.position}
          onChange={handlePositionChange}
          className="row-select char-position-select"
          title="Position"
        >
          <option value="left">Left Side</option>
          <option value="center">Center</option>
          <option value="right">Right Side</option>
        </select>
      </div>
      <div className="row-actions">
        <button
          className="row-btn row-btn-remove"
          onClick={onRemove}
          title="Remove character"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Text Row (Dialogue)
// ============================================================================

interface TextRowProps {
  dialogue: DialogueLine;
  index: number;
  availableCharacters: CharacterAsset[];
  onChange: (changes: Partial<DialogueLine>) => void;
  onRemove: () => void;
  isModified?: boolean;
}

export function TextRow({
  dialogue,
  index,
  availableCharacters,
  onChange,
  onRemove,
  isModified = false,
}: TextRowProps) {
  const handleSpeakerChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onChange({ speaker: value === '' ? null : value });
    },
    [onChange]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange({ text: e.target.value });
    },
    [onChange]
  );

  return (
    <div className={`editor-row editor-row-text ${isModified ? 'modified' : ''}`}>
      <div className="row-type">
        <span className="type-icon">{'\u{1F4AC}'}</span>
        <span className="type-label">Text</span>
      </div>
      <div className="row-content row-content-text">
        {/* Speaker */}
        <select
          value={dialogue.speaker || ''}
          onChange={handleSpeakerChange}
          className="row-select speaker-select"
          title="Speaker"
        >
          <option value="">Narrator</option>
          {availableCharacters.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Text */}
        <textarea
          value={dialogue.text}
          onChange={handleTextChange}
          className="row-textarea dialogue-text-input"
          placeholder="Dialogue text..."
          rows={2}
        />
      </div>
      <div className="row-actions">
        <button
          className="row-btn row-btn-remove"
          onClick={onRemove}
          title="Remove dialogue"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Choice Row
// ============================================================================

interface ChoiceRowProps {
  choice: MenuChoice;
  index: number;
  availableScenes: string[];
  onChange: (changes: Partial<MenuChoice>) => void;
  onRemove: () => void;
  isModified?: boolean;
}

export function ChoiceRow({
  choice,
  index,
  availableScenes,
  onChange,
  onRemove,
  isModified = false,
}: ChoiceRowProps) {
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ text: e.target.value });
    },
    [onChange]
  );

  const handleTargetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ target: e.target.value });
    },
    [onChange]
  );

  return (
    <div className={`editor-row editor-row-choice ${isModified ? 'modified' : ''}`}>
      <div className="row-type">
        <span className="type-icon">?</span>
        <span className="type-label">Pick</span>
      </div>
      <div className="row-content row-content-choice">
        {/* Choice text */}
        <input
          type="text"
          value={choice.text}
          onChange={handleTextChange}
          className="row-input choice-text-input"
          placeholder="Choice text..."
        />

        {/* Target scene */}
        <select
          value={choice.target}
          onChange={handleTargetChange}
          className="row-select choice-target-select"
          title="Target scene"
        >
          <option value={choice.target}>{choice.target}</option>
          {availableScenes
            .filter((s) => s !== choice.target)
            .map((scene) => (
              <option key={scene} value={scene}>
                {scene}
              </option>
            ))}
        </select>
      </div>
      <div className="row-actions">
        <button
          className="row-btn row-btn-remove"
          onClick={onRemove}
          title="Remove choice"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Add Row Button
// ============================================================================

interface AddRowButtonProps {
  type: 'character' | 'dialogue' | 'choice';
  onClick: () => void;
}

export function AddRowButton({ type, onClick }: AddRowButtonProps) {
  const labels: Record<string, string> = {
    character: '+ Add Character',
    dialogue: '+ Add Dialogue',
    choice: '+ Add Choice',
  };

  const icons: Record<string, string> = {
    character: '\u{1F464}',
    dialogue: '\u{1F4AC}',
    choice: '?',
  };

  return (
    <button className={`add-row-btn add-row-btn-${type}`} onClick={onClick}>
      <span className="add-icon">{icons[type]}</span>
      <span className="add-text">{labels[type]}</span>
    </button>
  );
}
