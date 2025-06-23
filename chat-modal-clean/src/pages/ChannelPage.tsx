import { useParams } from 'react-router-dom';

export default function ChannelPage() {
  const { id } = useParams();
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Channel {id}</h1>
      <p>Channel content will appear here</p>
    </div>
  );
}