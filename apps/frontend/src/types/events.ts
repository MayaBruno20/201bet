export type ApiEvent = {
  id: string;
  sport: string;
  name: string;
  description?: string | null;
  bannerUrl?: string | null;
  featured?: boolean;
  startAt: string;
  status: string;
  /**
   * Quando preenchido, este "evento" é um embate personalizado avulso renderizado
   * como evento standalone. O deep-link de aposta deve usar `?duelId=...`.
   */
  customDuelId?: string;
  markets: Array<{
    id: string;
    name: string;
    status: string;
    odds: Array<{
      id: string;
      label: string;
      value: number;
      status: string;
      version: number;
    }>;
  }>;
  duels: Array<{
    id: string;
    startsAt: string;
    bookingCloseAt: string;
    status: string;
    left: {
      carId: string;
      carName: string;
      driverName: string;
      category: string;
      avatarUrl?: string | null;
      carPhotoUrl?: string | null;
    };
    right: {
      carId: string;
      carName: string;
      driverName: string;
      category: string;
      avatarUrl?: string | null;
      carPhotoUrl?: string | null;
    };
  }>;
};
