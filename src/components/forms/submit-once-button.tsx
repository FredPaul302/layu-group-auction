'use client';

import { useState } from 'react';

type SubmitOnceButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
};

export function SubmitOnceButton({
  children,
  pendingLabel = 'Submitting...',
  className,
}: SubmitOnceButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <button
      className={className}
      disabled={isSubmitting}
      onClick={() => setIsSubmitting(true)}
      type="submit"
    >
      {isSubmitting ? pendingLabel : children}
    </button>
  );
}