import {
  BookOpen,
  Briefcase,
  Camera,
  Coffee,
  Dumbbell,
  Folder,
  Heart,
  Lightbulb,
  MapPin,
  Megaphone,
  Palette,
  Plane,
  ShoppingBag,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/** The small icon set a Space can carry (stored as the key in spaces.icon). */
export const SPACE_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  folder: { icon: Folder, label: "Folder" },
  megaphone: { icon: Megaphone, label: "Marketing" },
  lightbulb: { icon: Lightbulb, label: "Ideas" },
  briefcase: { icon: Briefcase, label: "Work" },
  palette: { icon: Palette, label: "Design" },
  camera: { icon: Camera, label: "Content" },
  utensils: { icon: Utensils, label: "Food" },
  coffee: { icon: Coffee, label: "Cafés" },
  "map-pin": { icon: MapPin, label: "Places" },
  plane: { icon: Plane, label: "Travel" },
  "shopping-bag": { icon: ShoppingBag, label: "Shopping" },
  dumbbell: { icon: Dumbbell, label: "Fitness" },
  "book-open": { icon: BookOpen, label: "Learning" },
  heart: { icon: Heart, label: "Personal" },
  sparkles: { icon: Sparkles, label: "Inspiration" },
};

export function spaceIcon(key: string | null | undefined): LucideIcon | null {
  return key && SPACE_ICONS[key] ? SPACE_ICONS[key].icon : null;
}
