import { useParams } from 'react-router-dom';

export default function NoteDetailPage() {
  const { id } = useParams();
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Note {id}</h1>
      <p>Note content will appear here</p>
    </div>
  );
}