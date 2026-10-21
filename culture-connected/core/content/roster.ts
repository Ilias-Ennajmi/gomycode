/**
 * Real client roster sourced from the Culture Connected client overview deck.
 * Photos and logos live in /public/{artists,labels,venues}. Names, credits and
 * locations are transcribed directly from that deck.
 */

export interface ArtistEntry {
  name: string;
  slug: string;
  image: string;
}

export const artistRoster: ArtistEntry[] = [
  { name: 'AJNA', slug: 'ajna', image: '/artists/ajna.jpg' },
  { name: 'Arkadyan', slug: 'arkadyan', image: '/artists/arkadyan.jpg' },
  { name: 'Awen', slug: 'awen', image: '/artists/awen.jpg' },
  { name: 'Echonomist', slug: 'echonomist', image: '/artists/echonomist.jpg' },
  { name: 'Emanuel Satie', slug: 'emanuel-satie', image: '/artists/emanuel-satie.jpg' },
  { name: 'Emmanuel Jal', slug: 'emmanuel-jal', image: '/artists/emmanuel-jal.jpg' },
  { name: 'Enzo Siffredi', slug: 'enzo-siffredi', image: '/artists/enzo-siffredi.jpg' },
  { name: 'GHEIST', slug: 'gheist', image: '/artists/gheist.jpg' },
  { name: 'JAMIIE', slug: 'jamiie', image: '/artists/jamiie.jpg' },
  { name: 'MAGA', slug: 'maga', image: '/artists/maga.jpg' },
  { name: 'Maxi Meraki', slug: 'maxi-meraki', image: '/artists/maxi-meraki.jpg' },
  { name: 'Moojo', slug: 'moojo', image: '/artists/moojo.jpg' },
  { name: 'Notre Dame', slug: 'notre-dame', image: '/artists/notre-dame.jpg' },
  { name: 'Novak', slug: 'novak', image: '/artists/novak.jpg' },
  { name: 'Rodriguez Jr.', slug: 'rodriguez-jr', image: '/artists/rodriguez-jr.jpg' },
  { name: 'Samm', slug: 'samm', image: '/artists/samm.jpg' },
  { name: 'Sean Doron', slug: 'sean-doron', image: '/artists/sean-doron.jpg' },
  { name: 'Sunnery James & Ryan Marciano', slug: 'sjrm', image: '/artists/sunnery-james-ryan-marciano.jpg' },
  { name: 'Tim Engelhardt', slug: 'tim-engelhardt', image: '/artists/tim-engelhardt.jpg' },
];

export interface LogoEntry {
  name: string;
  slug: string;
  image: string;
  credit?: string;
}

export const recordLabels: LogoEntry[] = [
  { name: 'Armada Music', slug: 'armada-music', image: '/labels/armada-music.jpg', credit: 'multiple releases' },
  { name: 'Helix Records', slug: 'helix-records', image: '/labels/helix-records.jpg', credit: '"No Shape Without You"' },
  { name: 'Magnifik Music', slug: 'magnifik-music', image: '/labels/magnifik-music.jpg', credit: 'multiple releases' },
  { name: 'Embassy One', slug: 'embassy-one', image: '/labels/embassy-one.png', credit: 'multiple releases' },
  { name: 'Scenarios', slug: 'scenarios', image: '/labels/scenarios.jpg', credit: '"Phantasy"' },
  { name: 'Klub Record', slug: 'klub-record', image: '/labels/klub-record.jpg', credit: '"Runi"' },
  { name: 'Wired Music', slug: 'wired-music', image: '/labels/wired-music.jpg', credit: 'multiple releases' },
  { name: 'Rummel Music', slug: 'rummel-music', image: '/labels/rummel-music.jpg', credit: 'multiple releases' },
];

export interface VenueEntry {
  name: string;
  slug: string;
  image: string;
  location?: string;
}

export const venueRoster: VenueEntry[] = [
  { name: 'Ópalo', slug: 'opalo', image: '/venues/opalo.jpg', location: 'Amsterdam' },
  { name: 'Superfekta', slug: 'superfekta', image: '/venues/superfekta.png', location: 'Barcelona' },
  { name: 'Kyma Beach Dubai', slug: 'kyma-beach-dubai', image: '/venues/kyma-beach-dubai.png', location: 'Dubai' },
  { name: 'Beachouse Ibiza', slug: 'beachouse-ibiza', image: '/venues/beachouse-ibiza.png', location: 'Ibiza' },
  { name: 'Amazone Project', slug: 'amazone-project', image: '/venues/amazone-project.jpg', location: 'Amsterdam' },
  { name: 'Marquee New York', slug: 'marquee-new-york', image: '/venues/marquee-new-york.jpg', location: 'New York' },
  { name: 'Zona', slug: 'zona', image: '/venues/zona.jpg', location: 'Marrakech' },
  { name: 'UMBRA', slug: 'umbra', image: '/venues/umbra.png', location: 'Marrakech, Paris, Dubai' },
  { name: 'Avalon Hollywood', slug: 'avalon-hollywood', image: '/venues/avalon-hollywood.png', location: 'Los Angeles' },
  { name: 'Puls', slug: 'puls', image: '/venues/puls.jpg', location: 'Tirana' },
  {
    name: 'Klein Phönix Istanbul',
    slug: 'klein-phonix-istanbul',
    image: '/venues/klein-phonix-istanbul.png',
    location: 'Istanbul',
  },
  { name: 'Leone', slug: 'leone', image: '/venues/leone.jpg', location: 'Marrakech' },
  { name: 'Late Night Music', slug: 'late-night-music', image: '/venues/late-night-music.jpg', location: 'Panama City' },
  { name: 'Cacao Amor', slug: 'cacao-amor', image: '/venues/cacao-amor.jpg', location: 'Bogotá, San José, Honduras' },
  { name: 'Nassau', slug: 'nassau', image: '/venues/nassau.jpg', location: 'Montenegro' },
  { name: 'Red House', slug: 'red-house', image: '/venues/red-house.jpg', location: 'Rabat' },
  { name: 'Sound of Africa', slug: 'sound-of-africa', image: '/venues/sound-of-africa.png', location: 'Casablanca' },
  { name: 'AMUR by Caprices Festival', slug: 'amur-caprices', image: '/venues/amur-caprices.png', location: 'Marrakech' },
  { name: 'Eden Nightclub', slug: 'eden-nightclub', image: '/venues/eden-nightclub.jpg', location: 'Marrakech' },
  { name: 'Babouchka', slug: 'babouchka', image: '/venues/babouchka.jpg', location: 'Marrakech' },
];
