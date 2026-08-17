export interface GoogleFontOption {
  name: string;
  family: string; // CSS font-family string (e.g. '"Bebas Neue", sans-serif')
  category: 'Viral Heavy' | 'Modern Sans' | 'Display' | 'Handwriting' | 'Serif';
  weights?: string[];
  googleFontName: string; // Name for Google Fonts API
}

export const POPULAR_GOOGLE_FONTS: GoogleFontOption[] = [
  // Viral Heavy & Subtitle Favorites
  { name: 'Bebas Neue', family: '"Bebas Neue", Impact, sans-serif', category: 'Viral Heavy', googleFontName: 'Bebas+Neue' },
  { name: 'Montserrat', family: 'Montserrat, sans-serif', category: 'Modern Sans', googleFontName: 'Montserrat' },
  { name: 'Anton', family: 'Anton, sans-serif', category: 'Viral Heavy', googleFontName: 'Anton' },
  { name: 'Outfit', family: 'Outfit, sans-serif', category: 'Modern Sans', googleFontName: 'Outfit' },
  { name: 'Poppins', family: 'Poppins, sans-serif', category: 'Modern Sans', googleFontName: 'Poppins' },
  { name: 'Oswald', family: 'Oswald, sans-serif', category: 'Viral Heavy', googleFontName: 'Oswald' },
  { name: 'Archivo Black', family: '"Archivo Black", sans-serif', category: 'Viral Heavy', googleFontName: 'Archivo+Black' },
  { name: 'Russo One', family: '"Russo One", sans-serif', category: 'Viral Heavy', googleFontName: 'Russo+One' },
  { name: 'Rowdies', family: 'Rowdies, sans-serif', category: 'Viral Heavy', googleFontName: 'Rowdies' },
  { name: 'Paytone One', family: '"Paytone One", sans-serif', category: 'Viral Heavy', googleFontName: 'Paytone+One' },
  { name: 'Bungee', family: 'Bungee, sans-serif', category: 'Viral Heavy', googleFontName: 'Bungee' },
  { name: 'Days One', family: '"Days One", sans-serif', category: 'Viral Heavy', googleFontName: 'Days+One' },
  { name: 'Staatliches', family: 'Staatliches, cursive', category: 'Viral Heavy', googleFontName: 'Staatliches' },
  { name: 'Carter One', family: '"Carter One", cursive', category: 'Viral Heavy', googleFontName: 'Carter+One' },
  { name: 'Racing Sans One', family: '"Racing Sans One", cursive', category: 'Viral Heavy', googleFontName: 'Racing+Sans+One' },
  { name: 'Alfa Slab One', family: '"Alfa Slab One", cursive', category: 'Viral Heavy', googleFontName: 'Alfa+Slab+One' },
  { name: 'Passion One', family: '"Passion One", cursive', category: 'Viral Heavy', googleFontName: 'Passion+One' },
  { name: 'Bowlby One SC', family: '"Bowlby One SC", cursive', category: 'Viral Heavy', googleFontName: 'Bowlby+One+SC' },
  { name: 'Kanit', family: 'Kanit, sans-serif', category: 'Viral Heavy', googleFontName: 'Kanit' },
  { name: 'League Spartan', family: '"League Spartan", sans-serif', category: 'Viral Heavy', googleFontName: 'League+Spartan' },
  { name: 'Black Han Sans', family: '"Black Han Sans", sans-serif', category: 'Viral Heavy', googleFontName: 'Black+Han+Sans' },
  { name: 'Teko', family: 'Teko, sans-serif', category: 'Viral Heavy', googleFontName: 'Teko' },
  { name: 'Barlow Condensed', family: '"Barlow Condensed", sans-serif', category: 'Viral Heavy', googleFontName: 'Barlow+Condensed' },
  { name: 'Impact (System)', family: 'Impact, "Bebas Neue", sans-serif', category: 'Viral Heavy', googleFontName: '' },

  // Modern & Clean Sans
  { name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif', category: 'Modern Sans', googleFontName: 'Plus+Jakarta+Sans' },
  { name: 'Inter', family: 'Inter, system-ui, sans-serif', category: 'Modern Sans', googleFontName: 'Inter' },
  { name: 'Space Grotesk', family: '"Space Grotesk", sans-serif', category: 'Modern Sans', googleFontName: 'Space+Grotesk' },
  { name: 'DM Sans', family: '"DM Sans", sans-serif', category: 'Modern Sans', googleFontName: 'DM+Sans' },
  { name: 'Urbanist', family: 'Urbanist, sans-serif', category: 'Modern Sans', googleFontName: 'Urbanist' },
  { name: 'Rubik', family: 'Rubik, sans-serif', category: 'Modern Sans', googleFontName: 'Rubik' },
  { name: 'Sora', family: 'Sora, sans-serif', category: 'Modern Sans', googleFontName: 'Sora' },
  { name: 'Josefin Sans', family: '"Josefin Sans", sans-serif', category: 'Modern Sans', googleFontName: 'Josefin+Sans' },
  { name: 'Comfortaa', family: 'Comfortaa, cursive', category: 'Modern Sans', googleFontName: 'Comfortaa' },
  { name: 'Fira Code', family: '"Fira Code", monospace', category: 'Modern Sans', googleFontName: 'Fira+Code' },

  // Display & Futuristic / Gaming
  { name: 'Syne', family: 'Syne, sans-serif', category: 'Display', googleFontName: 'Syne' },
  { name: 'Orbitron', family: 'Orbitron, sans-serif', category: 'Display', googleFontName: 'Orbitron' },
  { name: 'Audiowide', family: 'Audiowide, cursive', category: 'Display', googleFontName: 'Audiowide' },
  { name: 'Righteous', family: 'Righteous, cursive', category: 'Display', googleFontName: 'Righteous' },
  { name: 'Luckiest Guy', family: '"Luckiest Guy", cursive', category: 'Display', googleFontName: 'Luckiest+Guy' },
  { name: 'Bangers', family: 'Bangers, cursive', category: 'Display', googleFontName: 'Bangers' },
  { name: 'Titan One', family: '"Titan One", cursive', category: 'Display', googleFontName: 'Titan+One' },
  { name: 'Fredoka', family: 'Fredoka, sans-serif', category: 'Display', googleFontName: 'Fredoka' },
  { name: 'Chakra Petch', family: '"Chakra Petch", sans-serif', category: 'Display', googleFontName: 'Chakra+Petch' },
  { name: 'Press Start 2P', family: '"Press Start 2P", monospace', category: 'Display', googleFontName: 'Press+Start+2P' },
  { name: 'Monoton', family: 'Monoton, cursive', category: 'Display', googleFontName: 'Monoton' },
  { name: 'Creepster', family: 'Creepster, cursive', category: 'Display', googleFontName: 'Creepster' },
  { name: 'Shrikhand', family: 'Shrikhand, cursive', category: 'Display', googleFontName: 'Shrikhand' },

  // Handwriting & Casual Creator
  { name: 'Permanent Marker', family: '"Permanent Marker", cursive', category: 'Handwriting', googleFontName: 'Permanent+Marker' },
  { name: 'Caveat', family: 'Caveat, cursive', category: 'Handwriting', googleFontName: 'Caveat' },
  { name: 'Pacifico', family: 'Pacifico, cursive', category: 'Handwriting', googleFontName: 'Pacifico' },
  { name: 'Satisfy', family: 'Satisfy, cursive', category: 'Handwriting', googleFontName: 'Satisfy' },
  { name: 'Lobster', family: 'Lobster, cursive', category: 'Handwriting', googleFontName: 'Lobster' },
  { name: 'Shadows Into Light', family: '"Shadows Into Light", cursive', category: 'Handwriting', googleFontName: 'Shadows+Into+Light' },
  { name: 'Kaushan Script', family: '"Kaushan Script", cursive', category: 'Handwriting', googleFontName: 'Kaushan+Script' },
  { name: 'Great Vibes', family: '"Great Vibes", cursive', category: 'Handwriting', googleFontName: 'Great+Vibes' },

  // Luxury & Serif
  { name: 'Playfair Display', family: '"Playfair Display", serif', category: 'Serif', googleFontName: 'Playfair+Display' },
  { name: 'Cinzel', family: 'Cinzel, serif', category: 'Serif', googleFontName: 'Cinzel' },
  { name: 'Cinzel Decorative', family: '"Cinzel Decorative", serif', category: 'Serif', googleFontName: 'Cinzel+Decorative' },
  { name: 'Abril Fatface', family: '"Abril Fatface", cursive', category: 'Serif', googleFontName: 'Abril+Fatface' },
  { name: 'Prata', family: 'Prata, serif', category: 'Serif', googleFontName: 'Prata' },
  { name: 'Lora', family: 'Lora, serif', category: 'Serif', googleFontName: 'Lora' },
  { name: 'Cormorant Garamond', family: '"Cormorant Garamond", serif', category: 'Serif', googleFontName: 'Cormorant+Garamond' },
  { name: 'Bodoni Moda', family: '"Bodoni Moda", serif', category: 'Serif', googleFontName: 'Bodoni+Moda' },
];

const loadedFonts = new Set<string>();

/**
 * Dynamically loads a Google Font by name into the document <head>
 * so that canvas rendering and DOM previews support it immediately.
 */
export function loadGoogleFont(fontName: string): Promise<boolean> {
  if (!fontName || fontName.toLowerCase() === 'impact' || fontName.toLowerCase() === 'system-ui') {
    return Promise.resolve(true);
  }

  // Extract clean font family name (e.g. '"Bebas Neue", sans-serif' -> 'Bebas Neue')
  const cleanName = fontName.replace(/["']/g, '').split(',')[0].trim();
  if (!cleanName) return Promise.resolve(false);

  const fontId = `gf-${cleanName.toLowerCase().replace(/\s+/g, '-')}`;

  if (loadedFonts.has(cleanName) || document.getElementById(fontId)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    try {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      const formattedGoogleFontName = encodeURIComponent(cleanName).replace(/%20/g, '+');
      link.href = `https://fonts.googleapis.com/css2?family=${formattedGoogleFontName}:wght@400;600;700;800;900&display=swap`;

      link.onload = () => {
        loadedFonts.add(cleanName);
        if ('fonts' in document) {
          document.fonts.ready.then(() => resolve(true)).catch(() => resolve(true));
        } else {
          resolve(true);
        }
      };

      link.onerror = () => {
        console.warn(`Failed to load Google Font: ${cleanName}`);
        resolve(false);
      };

      document.head.appendChild(link);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Preloads the most popular subtitle fonts at startup
 */
export function preloadPopularGoogleFonts() {
  [
    'Bebas Neue',
    'Montserrat',
    'Anton',
    'Outfit',
    'Poppins',
    'Oswald',
    'Archivo Black',
    'Space Grotesk',
    'Syne',
    'Plus Jakarta Sans',
    'Russo One',
    'Rowdies',
    'Urbanist',
    'Orbitron',
    'Playfair Display',
    'Cinzel',
    'Permanent Marker',
    'Press Start 2P',
  ].forEach(loadGoogleFont);
}
