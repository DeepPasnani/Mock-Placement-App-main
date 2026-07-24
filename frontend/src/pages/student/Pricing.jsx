import { useQuery } from '@tanstack/react-query';
import { paymentAPI } from '../../services/api';
import { Btn, Spinner } from '../../components/shared/UI';
import toast from 'react-hot-toast';

export default function StudentPricing() {
  const { data, isLoading } = useQuery({ queryKey: ['payment-plans'], queryFn: paymentAPI.getPlans });
  const plans = data?.plans || [];

  const handleBuy = async (plan) => {
    try {
      const res = await paymentAPI.createCheckout({ planId: plan.id });
      if (res.url) window.location.href = res.url;
      else if (res.order) {
        const options = {
          key: res.key_id,
          amount: res.order.amount,
          currency: res.order.currency,
          name: 'PlacementPro',
          order_id: res.order.id,
          handler: async (response) => {
            await paymentAPI.razorpayVerify({ ...response, planId: plan.id });
            toast.success('Payment successful!');
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Payment failed');
    }
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <h1 className="text-display">Choose Your Plan</h1>
        <p className="section-subtitle">Unlock premium features for placement preparation</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {plans.map(plan => (
          <div key={plan.id} className="panel p-6 flex flex-col">
            <h3 className="font-display font-bold text-lg text-ink">{plan.name}</h3>
            <p className="text-xs text-annotation mt-1 mb-4">{plan.description}</p>
            <div className="mb-4">
              <span className="text-3xl font-display font-bold text-ink">{plan.currency} {plan.amount}</span>
              <span className="text-xs text-annotation">/{plan.duration_days} days</span>
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {(plan.features || []).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-ink">
                  <svg className="w-3.5 h-3.5 text-verify shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Btn onClick={() => handleBuy(plan)} className="w-full">Buy Now</Btn>
          </div>
        ))}
        {!plans.length && (
          <div className="col-span-full text-center py-12 text-annotation text-sm">No plans available yet.</div>
        )}
      </div>
    </div>
  );
}
