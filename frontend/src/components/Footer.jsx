const Footer = () => {
  return (
    <footer className="bg-navy px-8 py-10 text-sm text-gray-300">
      <div className="mx-auto max-w-6xl">
        <p className="text-lg font-bold text-white">MovieBooking</p>
        <p className="mt-2 text-gray-400">
          Book tickets for the latest movies, events, and plays near you.
        </p>
        <p className="mt-8 text-xs text-gray-500">
          &copy; {new Date().getFullYear()} MovieBooking. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
