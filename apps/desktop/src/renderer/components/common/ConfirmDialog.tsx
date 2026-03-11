interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null {
  if (!props.open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={props.onCancel}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-title">{props.title}</div>
        <div className="modal-text">{props.message}</div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
          <button
            type="button"
            className={props.destructive ? "btn btn-danger" : "btn btn-primary"}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
