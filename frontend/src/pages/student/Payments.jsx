import { useQuery } from '@tanstack/react-query';
import { paymentAPI } from '../../services/api';
import { Spinner, Table } from '../../components/shared/UI';
import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import toast from 'react-hot-toast';

export default function StudentPayments() {
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ['my-payments'], queryFn: paymentAPI.getHistory });

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Payment successful!');
    }
  }, [searchParams]);

  const transactions = data?.transactions || [];
  const columns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'plan_name', label: 'Plan' },
    { key: 'amount', label: 'Amount', render: (r) => `${r.currency} ${r.amount}` },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.status === 'success' ? 'badge-verify' : r.status === 'failed' ? 'badge-alert' : 'badge-accent'}`}>{r.status}</span> },
    { key: 'provider', label: 'Provider', render: (r) => <span className="badge badge-annotation">{r.provider}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Payment History</h1>
          <p className="section-subtitle">Your transaction records</p>
        </div>
      </div>

      <div className="panel p-4">
        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : <Table columns={columns} data={transactions} emptyMessage="No payments yet" />}
      </div>
    </div>
  );
}
