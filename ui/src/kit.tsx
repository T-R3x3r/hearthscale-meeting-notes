/**
 * The parts the view draws, built on the kit the platform loads into every
 * view: its `hs-*` classes, which give each part the look of the same part
 * in the shell, and the Remix Icon font with its `ri-*` classes.
 */
import { useEffect, useState, type ReactNode } from 'react';

/** A Remix Icon by its remixicon.com name, at a size in pixels, in the
 *  colour of the text around it. */
export function Icon({ name, size }: { name: string; size: number }) {
  return <i aria-hidden="true" className={`ri-${name} notes-icon`} style={{ fontSize: size }} />;
}

/** A control that shows a mark alone, its name in a tooltip, which a
 *  press closes until the pointer leaves. */
export function MarkPress({
  label,
  className,
  onPress,
  children,
}: {
  label: string;
  className: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const [closed, setClosed] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      className={`hs-tipwrap ${className}`}
      data-tip-closed={closed ? 'true' : undefined}
      onPointerDown={() => setClosed(true)}
      onMouseLeave={() => setClosed(false)}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
    >
      {children}
      <span className="hs-tip hs-tooltip notes-tip" data-sub="false">
        <span className="hs-tooltip-title">{label}</span>
      </span>
    </span>
  );
}

/** A dialog that asks once more before an action that destroys
 *  something; Escape and a press outside it cancel. */
export function Confirm({
  title,
  action,
  onConfirm,
  onCancel,
}: {
  title: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  return (
    <div
      className="hs-confirm"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div className="hs-confirm-box" role="dialog" onClick={(e) => e.stopPropagation()}>
        <span className="hs-confirm-title">{title}</span>
        <div className="hs-confirm-footer">
          <button
            type="button"
            className="hs-button hs-confirm-cancel"
            data-variant="secondary"
            data-size="sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hs-button hs-confirm-action"
            data-variant="danger"
            data-size="sm"
            onClick={onConfirm}
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A text button with a mark before its words. */
export function Button({
  icon,
  variant = 'secondary',
  onPress,
  children,
}: {
  icon: string;
  variant?: 'secondary' | 'danger';
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="hs-button"
      data-variant={variant}
      data-size="sm"
      onClick={onPress}
    >
      <Icon name={icon} size={14} />
      {children}
    </button>
  );
}

/** A condition stated inline, such as a refusal. */
export function Notice({ children }: { children: ReactNode }) {
  return <div className="hs-notice">{children}</div>;
}
