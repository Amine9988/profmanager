import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ovhvblmlsljkkyeyktsd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92aHZibG1sc2xqa2t5ZXlrdHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTA2MjcsImV4cCI6MjA5NzYyNjYyN30.dd_rKXp0tbZiCYMwWROZJJB2vbs478_7dfy6NZcii5c';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@admin.com',
  password: 'admin123'
});

console.log('========== RESULT ==========');
console.log('data:', JSON.stringify(data, null, 2));
console.log('error:', JSON.stringify(error, null, 2));
console.log('============================');

if (data?.session) {
  console.log('SESSION EXISTS:', !!data.session);
  console.log('ACCESS TOKEN (first 50 chars):', data.session.access_token?.substring(0, 50));
  console.log('REFRESH TOKEN (first 50 chars):', data.session.refresh_token?.substring(0, 50));
}
