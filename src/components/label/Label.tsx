interface LabelProps {
  htmlFor: string;
  title: string;
}

export function Label({ htmlFor, title }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className="text-ob-base-300 text-sm font-medium">
      {title}
    </label>
  );
}
