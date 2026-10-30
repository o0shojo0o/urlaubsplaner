import { useEffect, useRef } from 'react';
import { Sun, X } from 'lucide-react';
export function ErrorBox({ error }) {
  return error ? (
    <div className="error-box" role="alert">
      {error}
    </div>
  ) : null;
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Wird geladen …
    </div>
  );
}

export function Empty({ children }) {
  return (
    <div className="empty">
      <Sun size={28} />
      <p>{children}</p>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <header className="modal-header">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Schließen" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
