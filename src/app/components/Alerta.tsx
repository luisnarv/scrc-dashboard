interface AlertaProps {
  color: 'rojo' | 'amarillo' | 'verde';
  icono: string;
  texto: string;
  onClick?: () => void;
}

export default function Alerta({ color, icono, texto, onClick }: AlertaProps) {
  return (
    <div className={`alerta ${color}`} onClick={onClick}>
      <span className="icono">{icono}</span>
      <span>{texto}</span>
    </div>
  );
}
