interface DriverProps {
  tipo: 'pos' | 'neg' | 'info';
  tipoLabel: string;
  children: React.ReactNode;
  indent?: boolean;
}

export default function Driver({ tipo, tipoLabel, children, indent }: DriverProps) {
  return (
    <div className="driver" style={indent ? { marginLeft: 20 } : undefined}>
      <span className={`tipo ${tipo}`}>{tipoLabel}</span>
      {children}
    </div>
  );
}
