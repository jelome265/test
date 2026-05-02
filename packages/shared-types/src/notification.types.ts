export type NotificationType =
  | 'shipment_created'
  | 'shipment_approved'
  | 'shipment_rejected'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'shipment_picked_up'
  | 'shipment_in_transit'
  | 'shipment_delivered'
  | 'shipment_confirmed'
  | 'admin_new_request';

export interface AppNotification {
  id: string;
  user_id: string;
  shipment_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string>;   // For deep linking
  is_read: boolean;
  push_sent: boolean;
  push_sent_at: string | null;
  push_failed_at: string | null;
  push_error: string | null;
  created_at: string;
}

export interface DisputeTicket {
  id: string;
  shipment_id: string;
  user_id: string;
  category:
    | 'package_damaged'
    | 'package_lost'
    | 'not_delivered'
    | 'wrong_delivery'
    | 'payment_issue'
    | 'other';
  description: string;
  evidence_urls: string[];
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}
