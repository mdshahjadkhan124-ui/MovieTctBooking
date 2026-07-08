const AdminPlaceholderPage = ({ title }) => (
  <div className="flex flex-col gap-2">
    <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
    <p className="text-sm text-gray-500">{title} management is coming in a later chunk.</p>
  </div>
);

export default AdminPlaceholderPage;
