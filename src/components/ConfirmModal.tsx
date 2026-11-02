import { AlertTriangle } from 'lucide-react';
import Dialog from './ui/Dialog';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

const tones = {
  danger: {
    icon: 'border-destructive/20 bg-destructive/10 text-destructive',
    action: 'danger' as const,
  },
  warning: {
    icon: 'border-warning/20 bg-warning/10 text-warning',
    action: 'primary' as const,
  },
  info: {
    icon: 'border-info/20 bg-info/10 text-info',
    action: 'primary' as const,
  },
};

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmModalProps) {
  const tone = tones[variant];

  const handleCancel = () => {
    if (loading) return;
    if (onCancel) onCancel();
    else onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleCancel}
      title={title}
      size="sm"
      hideClose={loading}
      footer={
        <>
          <Button variant="ghost" onClick={handleCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={tone.action} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl border', tone.icon)}>
          <AlertTriangle size={20} />
        </span>
        <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </Dialog>
  );
}
