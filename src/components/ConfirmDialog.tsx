import { AlertTriangle } from 'lucide-react';
import Dialog from './ui/Dialog';
import { Button } from './ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onClose={() => !isLoading && onClose()}
      title={title}
      size="sm"
      hideClose={isLoading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={isLoading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
          <AlertTriangle size={20} />
        </span>
        <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </Dialog>
  );
}
