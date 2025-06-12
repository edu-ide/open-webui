import { useParams } from 'react-router-dom';

export default function SharedChatPage() {
  const { id } = useParams();
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Shared Chat {id}</h1>
      <p>This is a publicly shared chat</p>
    </div>
  );
}