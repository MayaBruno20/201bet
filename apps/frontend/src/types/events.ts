export type ApiEvent = {
  id: string;
  sport: string;
  name: string;
  startAt: string;
  status: string;
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
    };
    right: {
      carId: string;
      carName: string;
      driverName: string;
      category: string;
    };
  }>;
};
