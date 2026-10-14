import React from 'react';
import { Modal } from './ui.jsx';

export default function ConfirmDialog({ state, onDone }) {
  return (
    <Modal
      open={!!state}
      title="אישור פעולה"
      onClose={() => onDone(false)}
      actions={
        <>
          <button className="btn btn-danger" data-testid="confirm-yes" onClick={() => onDone(true)}>{state?.okLabel || 'אישור'}</button>
          <button className="btn btn-ghost" onClick={() => onDone(false)}>ביטול</button>
        </>
      }
    >
      <p className="confirm-text">{state?.message}</p>
    </Modal>
  );
}
