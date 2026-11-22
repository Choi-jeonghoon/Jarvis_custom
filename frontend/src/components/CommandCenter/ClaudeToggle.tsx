import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '../../lib/store';

/**
 * Top-bar switch: ON routes chat to the Claude API model, OFF restores the
 * model that was active before (usually the local Ollama model).
 */
export function ClaudeToggle() {
  const navigate = useNavigate();
  const enabled = useAppStore((s) => s.settings.claudeEnabled);
  const claudeModel = useAppStore((s) => s.settings.claudeModel);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setClaudeEnabled = useAppStore((s) => s.setClaudeEnabled);
  const [error, setError] = useState('');

  // "Active" = toggle on AND chats actually go to Claude right now.
  const active = enabled && selectedModel === claudeModel;

  const onClick = () => {
    setError('');
    const ok = setClaudeEnabled(!active);
    if (!ok) {
      setError('Claude 모델을 찾을 수 없습니다. 설정에서 Anthropic API 키를 등록하세요.');
      setTimeout(() => setError(''), 5000);
    }
  };

  return (
    <div className="cc-claude-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        className={`cc-claude-toggle ${active ? 'on' : ''}`}
        onClick={onClick}
        title={active ? `Claude 사용 중 (${claudeModel}) — 클릭하면 기본 모델로 전환` : '클릭하면 Claude로 전환'}
      >
        <Sparkles size={13} />
        <span>CLAUDE</span>
        <i className="cc-claude-knob"><b /></i>
        <em>{active ? 'ON' : 'OFF'}</em>
      </button>
      {error && (
        <button type="button" className="cc-claude-error" onClick={() => navigate('/settings')}>
          {error}
        </button>
      )}
    </div>
  );
}
