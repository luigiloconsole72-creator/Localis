// I comuni dell'atlante delle masserie: posizione (centro del paese, per la mappa
// illustrata) e foto di territorio già usata dal sito come copertina della guida.
// La foto è del paese, mai della masseria: le foto delle masserie entrano solo con
// il loro permesso (mail di ringraziamento).

export interface Comune {
  slug: string;
  label: string;
  lat: number;
  lng: number;
  img?: string;
  imgAlt?: string;
}

export const COMUNI: Comune[] = [
  { slug: 'fasano', label: 'Fasano', lat: 40.8366, lng: 17.3586, img: '/images/covers/fasano.jpg', imgAlt: 'Fasano e la piana degli ulivi vista dalla Selva' },
  { slug: 'ostuni', label: 'Ostuni', lat: 40.729, lng: 17.5777, img: '/images/covers/ostuni.jpg', imgAlt: 'Le mura bianche di Ostuni' },
  { slug: 'alberobello', label: 'Alberobello', lat: 40.7845, lng: 17.237, img: '/images/covers/alberobello.jpg', imgAlt: 'I trulli di Alberobello' },
  { slug: 'locorotondo', label: 'Locorotondo', lat: 40.7546, lng: 17.3262, img: '/images/covers/locorotondo.jpg', imgAlt: 'Locorotondo sopra le vigne, al tramonto' },
  { slug: 'martina-franca', label: 'Martina Franca', lat: 40.7051, lng: 17.3376, img: '/images/covers/martina-franca.jpg', imgAlt: 'Il Palazzo Ducale di Martina Franca' },
  { slug: 'cisternino', label: 'Cisternino', lat: 40.7419, lng: 17.425, img: '/images/covers/cisternino.jpg', imgAlt: 'Un fornello pronto di Cisternino' },
];

// Paesi di riferimento sulla mappa, senza masserie (solo per orientarsi).
export const RIFERIMENTI = [
  { label: 'Monopoli', lat: 40.9506, lng: 17.301 },
  { label: 'Ceglie Messapica', lat: 40.6467, lng: 17.5153 },
];

// Il comune è quello nominato per primo in `place`
// («Locorotondo, verso Cisternino» → Locorotondo).
export function comuneDi(place: string): Comune | undefined {
  let best: { c: Comune; at: number } | undefined;
  for (const c of COMUNI) {
    const at = place.indexOf(c.label);
    if (at >= 0 && (!best || at < best.at)) best = { c, at };
  }
  return best?.c;
}

export const minuti = (s: number) => Math.max(1, Math.round(s / 60));

// L'ordine dell'atlante: per paese (nell'ordine di COMUNI), poi per nome. Lo usano
// l'indice e le schede, così il numero di una masseria («07») è lo stesso ovunque.
export function inOrdine<T extends { data: { place: string; name: string } }>(lista: T[]): T[] {
  const pos = (m: T) => {
    const c = comuneDi(m.data.place);
    return c ? COMUNI.indexOf(c) : COMUNI.length;
  };
  return [...lista].sort((a, b) => pos(a) - pos(b) || a.data.name.localeCompare(b.data.name, 'it'));
}
