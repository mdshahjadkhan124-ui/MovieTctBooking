import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import HomePage from "./pages/HomePage.jsx";
import SeatSelectionPage from "./pages/SeatSelectionPage.jsx";

const App = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/showtimes/:id/seats" element={<SeatSelectionPage />} />
      </Route>
    </Routes>
  );
};

export default App;
