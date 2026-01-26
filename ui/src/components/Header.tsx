import { formatDate } from '../utils/formatters';

interface HeaderProps {
  generatedAt: number | null;
}

export function Header({ generatedAt }: HeaderProps) {
  return (
    <div className="header">
      <h1>Decentraland World Report</h1>
      <p>
        Asset Optimization Pipeline Status
        {generatedAt ? ` - Generated on ${formatDate(generatedAt)}` : ''}
      </p>
    </div>
  );
}
