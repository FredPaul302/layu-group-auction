type HoneypotFieldProps = {
  name?: string;
  label?: string;
  className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function HoneypotField({
  name = 'website',
  label = 'Leave this field empty',
  className,
}: HoneypotFieldProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'absolute left-[-10000px] top-auto h-px w-px overflow-hidden',
        className,
      )}
    >
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}