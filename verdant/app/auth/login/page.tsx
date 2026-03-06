'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Leaf, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { authService } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/toaster';
import { Button, Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

const passwordSchema = z.string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'One uppercase letter')
  .regex(/[a-z]/, 'One lowercase letter')
  .regex(/[0-9]/, 'One number')
  .regex(/[^A-Za-z0-9]/, 'One special character');

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1, 'Required') });
const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional().or(z.literal('')),
  type: z.enum(['customer', 'vendor']),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const { setUser } = useAuthStore();
  const { add: toast } = useToast();
  const redirect = searchParams.get('redirect') || '/';

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema), defaultValues: { type: 'customer' } });

  const onLogin = async (data: LoginForm) => {
    try {
      const result = await authService.login(data);
      setUser(result.user, result.accessToken, result.refreshToken);
      toast('Welcome back! 🌿');
      router.push(redirect);
    } catch (e: unknown) {
      toast((e as Error).message || 'Login failed', 'error');
    }
  };

  const onRegister = async (data: RegisterForm) => {
    try {
      const payload = { email: data.email, password: data.password, ...(data.phone ? { phone: data.phone } : {}) };
      if (data.type === 'vendor') {
        await authService.registerVendor(payload);
      } else {
        await authService.registerCustomer(payload);
      }
      toast('Account created! Please verify your email, then sign in.');
      setTab('login');
      registerForm.reset();
    } catch (e: unknown) {
      toast((e as Error).message || 'Registration failed', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-forest-950">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=1600&fit=crop')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-forest-950/90 via-forest-900/70 to-transparent" />
        <div className="relative z-10 flex flex-col justify-between p-12">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-forest-500/30 flex items-center justify-center">
              <Leaf className="h-4 w-4 text-forest-300" />
            </div>
            <span className="font-display text-xl font-bold text-white">Verdant Market</span>
          </Link>
          <div>
            <h2 className="font-display text-4xl font-bold text-white leading-tight mb-4">
              Where nature<br />meets your kitchen.
            </h2>
            <p className="text-white/60 text-sm leading-relaxed">
              Join thousands of customers who trust Verdant for pure, farm-fresh organic groceries — delivered right to their door.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[['500+', 'Products'], ['10K+', 'Customers'], ['4.9★', 'Rating']].map(([val, lbl]) => (
                <div key={lbl} className="glass rounded-xl p-3 text-center">
                  <p className="font-display text-xl font-bold text-forest-300">{val}</p>
                  <p className="text-xs text-white/50 mt-0.5">{lbl}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Shop
          </Link>

          {/* Tabs */}
          <div className="flex bg-secondary rounded-xl p-1 mb-8">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all duration-200',
                  tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === 'login' ? (
              <motion.form key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div>
                  <h1 className="font-display text-3xl font-bold text-foreground">Welcome back</h1>
                  <p className="text-muted-foreground text-sm mt-1">Sign in to your Verdant account</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" {...loginForm.register('email')} />
                  {loginForm.formState.errors.email && <p className="text-xs text-red-400">{loginForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link href="/auth/forgot-password" className="text-xs text-forest-400 hover:underline">Forgot password?</Link>
                  </div>
                  <div className="relative">
                    <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" {...loginForm.register('password')} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && <p className="text-xs text-red-400">{loginForm.formState.errors.password.message}</p>}
                </div>
                <Button type="submit" size="lg" className="w-full mt-2" loading={loginForm.formState.isSubmitting}>
                  Sign In
                </Button>
              </motion.form>
            ) : (
              <motion.form key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                <div>
                  <h1 className="font-display text-3xl font-bold text-foreground">Join Verdant</h1>
                  <p className="text-muted-foreground text-sm mt-1">Create your account to start shopping</p>
                </div>
                {/* Account type */}
                <div className="grid grid-cols-2 gap-2">
                  {(['customer', 'vendor'] as const).map((type) => (
                    <label key={type} className={cn('flex flex-col gap-1 p-3 rounded-xl border cursor-pointer transition-all', registerForm.watch('type') === type ? 'border-forest-500 bg-forest-500/10' : 'border-border bg-secondary hover:border-forest-500/50')}>
                      <input type="radio" value={type} {...registerForm.register('type')} className="sr-only" />
                      <span className="text-sm font-semibold capitalize text-foreground">{type}</span>
                      <span className="text-xs text-muted-foreground">{type === 'customer' ? 'Buy organic goods' : 'Sell your products'}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" placeholder="you@example.com" {...registerForm.register('email')} />
                  {registerForm.formState.errors.email && <p className="text-xs text-red-400">{registerForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input type={showPassword ? 'text' : 'password'} placeholder="Min 8 chars · upper · lower · number · symbol" {...registerForm.register('password')} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {registerForm.formState.errors.password && <p className="text-xs text-red-400">{registerForm.formState.errors.password.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Phone <span className="text-muted-foreground font-normal normal-case">(optional)</span></Label>
                  <Input type="tel" placeholder="+1234567890" {...registerForm.register('phone')} />
                </div>
                <Button type="submit" size="lg" className="w-full mt-2" loading={registerForm.formState.isSubmitting}>
                  Create Account
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  By registering, you agree to our Terms of Service and Privacy Policy.
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
