import { useParams } from "react-router-dom";

const SeatSelectionPage = () => {
  const { id } = useParams();

  return (
    <section className="flex flex-col items-center justify-center px-8 py-24 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Seat selection coming soon</h1>
      <p className="mt-2 text-sm text-gray-500">Showtime ID: {id}</p>
    </section>
  );
};

export default SeatSelectionPage;
