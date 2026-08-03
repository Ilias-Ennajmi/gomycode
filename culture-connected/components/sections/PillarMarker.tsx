type Marker = 'circle-red' | 'square-inv' | 'ring-red' | 'diamond-red';

const markerClasses: Record<Marker, string> = {
  'circle-red': 'rounded-full bg-red',
  'square-inv': 'rounded-[9px] bg-inv',
  'ring-red': 'rounded-full border-[9px] border-red',
  'diamond-red': 'rounded-[9px] bg-red rotate-45',
};

export function PillarMarker({ marker }: { marker: Marker }) {
  return <div className={`mb-5 h-[34px] w-[34px] ${markerClasses[marker]}`} />;
}
