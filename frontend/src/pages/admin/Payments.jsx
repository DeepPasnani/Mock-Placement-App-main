import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentAPI } from '../../services/api';
import { Btn, Modal, Spinner, Table } from '../../components/shared/UI';
import toast from 'react-hot-toast';

export default function AdminPayments() {
  const [showPlan, setShowPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ name: '', description: '', amount: '', currency: 'INR', durationDays: 30, features: '' });
  const queryClient = useQueryClient();
  const { data: plansData } = useQuery({ queryKey: ['payment-plans'], queryFn: paymentAPI.getPlans });
  const { data: historyData, isLoading } = useQuery({ queryKey: ['payment-history'], queryFn: paymentAPI.getHistory });

  const createMutation = useMutation({
    mutationFn: paymentAPI.createPlan,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payment-plans'] }); setShowPlan(false); toast.success('Plan created'); },
  });
  const deleteMutation = useMutation({
    mutationFn: paymentAPI.deletePlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-plans'] }),
  });

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      ...planForm,
      amount: parseFloat(planForm.amount),
      durationDays: parseInt(planForm.durationDays),
      features: planForm.features.split('\n').filter(Boolean),
    });
  };

  const plans = plansData?.plans || [];
  const transactions = historyData?.transactions || [];

  const planColumns = [
    { key: 'name', label: 'Name' },
    { key: 'amount', label: 'Amount', render: (r) => `${r.currency} ${r.amount}` },
    { key: 'duration_days', label: 'Duration', render: (r) => `${r.duration_days} days` },
    { key: 'is_active', label: 'Active', render: (r) => <span className={`badge ${r.is_active ? 'badge-verify' : 'badge-alert'}`}>{r.is_active ? 'Yes' : 'No'}</span> },
    { key: 'actions', label: '', render: (r) => <Btn variant="danger" size="sm" onClick={() => { deleteMutation.mutate(r.id); toast.success('Deleted'); }}>Del</Btn> },
  ];

  const txnColumns = [
    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'user_name', label: 'User' },
    { key: 'plan_name', label: 'Plan' },
    { key: 'amount', label: 'Amount', render: (r) => `${r.currency} ${r.amount}` },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.status === 'success' ? 'badge-verify' : r.status === 'failed' ? 'badge-alert' : 'badge-accent'}`}>{r.status}</span> },
    { key: 'provider', label: 'Provider', render: (r) => <span className="badge badge-annotation">{r.provider}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="section-header">
        <div>
          <h1 className="text-display">Payments</h1>
          <p className="section-subtitle">Manage plans & transactions</p>
        </div>
        <Btn onClick={() => setShowPlan(true)}>Create Plan</Btn>
      </div>

      <div className="panel p-4">
        <h3 className="text-title mb-3">Payment Plans</h3>
        <Table columns={planColumns} data={plans} emptyMessage="No plans created" />
      </div>

      <div className="panel p-4">
        <h3 className="text-title mb-3">All Transactions</h3>
        {isLoading ? <Spinner /> : <Table columns={txnColumns} data={transactions} emptyMessage="No transactions" />}
      </div>

      <Modal isOpen={showPlan} onClose={() => setShowPlan(false)} title="Create Plan" width="max-w-md">
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <div><label className="input-label">Name</label><input className="input-field" value={planForm.name} onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))} required /></div>
          <div><label className="input-label">Description</label><textarea className="input-field textarea-field" value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">Amount</label><input type="number" step="0.01" className="input-field" value={planForm.amount} onChange={e => setPlanForm(p => ({ ...p, amount: e.target.value }))} required /></div>
            <div><label className="input-label">Currency</label><select className="select-field" value={planForm.currency} onChange={e => setPlanForm(p => ({ ...p, currency: e.target.value }))}><option value="INR">INR</option><option value="USD">USD</option></select></div>
          </div>
          <div><label className="input-label">Duration (days)</label><input type="number" className="input-field" value={planForm.durationDays} onChange={e => setPlanForm(p => ({ ...p, durationDays: e.target.value }))} /></div>
          <div><label className="input-label">Features (one per line)</label><textarea className="input-field textarea-field" value={planForm.features} onChange={e => setPlanForm(p => ({ ...p, features: e.target.value }))} rows={4} placeholder="Full access to all tests&#10;Coding problems included&#10;Detailed analytics" /></div>
          <Btn type="submit" className="w-full">Create Plan</Btn>
        </form>
      </Modal>
    </div>
  );
}
