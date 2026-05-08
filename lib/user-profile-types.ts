// Shared shape for the right-side user profile panel. Lives in lib/ so both
// the global store and the panel component can import it without creating
// a component <-> store circular dep.
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  status: string;
  teamName: string | null;
  lastSeenAt: string | null;
  activeSecondsToday: number;
  tasksDone: number;
  avgRating: number | null;
  ratingCount: number;
  joinedAt: string;
}
