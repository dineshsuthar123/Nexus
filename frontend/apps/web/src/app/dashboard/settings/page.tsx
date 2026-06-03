'use client';

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Avatar,
  AvatarFallback,
  Badge,
  Skeleton,
} from '@nexus/ui';
import { User, Shield, Bell, CreditCard, Key, Globe, Smartphone, Save, Plus, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  useUserProfile,
  useUpdateProfile,
  useChangePassword,
  useAPIKeys,
  useCreateAPIKey,
  useRevokeAPIKey,
} from '@/lib/hooks/use-user';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/lib/hooks/use-notifications';

export default function SettingsPage() {
  const { data: profile, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useUserProfile();
  const { data: apiKeys, isLoading: keysLoading } = useAPIKeys();
  const { data: notifPrefs, isLoading: prefsLoading } = useNotificationPreferences();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const createApiKey = useCreateAPIKey();
  const revokeApiKey = useRevokeAPIKey();
  const updatePrefs = useUpdateNotificationPreferences();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [profileInit, setProfileInit] = useState(false);

  // Initialize form values when data loads
  if (profile && !profileInit) {
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setEmail(profile.email ?? '');
    setProfileInit(true);
  }

  const handleSaveProfile = useCallback(() => {
    updateProfile.mutate({
      firstName,
      lastName,
    });
  }, [firstName, lastName, updateProfile]);

  const handleChangePassword = useCallback(() => {
    if (newPassword !== confirmPassword) return;
    changePassword.mutate({
      currentPassword,
      newPassword,
    });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, [currentPassword, newPassword, confirmPassword, changePassword]);

  const handleCreateKey = useCallback(() => {
    if (!newKeyName.trim()) return;
    createApiKey.mutate({ name: newKeyName });
    setNewKeyName('');
  }, [newKeyName, createApiKey]);

  if (profileError) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-danger-500" />
        <h2 className="mt-4 text-lg font-semibold">Failed to load settings</h2>
        <Button className="mt-4" onClick={() => refetchProfile()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="profile" orientation="vertical" className="flex flex-col gap-6 lg:flex-row">
        <TabsList variant="pills" className="h-fit flex-col items-stretch lg:w-56">
          <TabsTrigger value="profile" variant="pills" className="justify-start">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" variant="pills" className="justify-start">
            <Shield className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" variant="pills" className="justify-start">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="billing" variant="pills" className="justify-start">
            <CreditCard className="mr-2 h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="api" variant="pills" className="justify-start">
            <Key className="mr-2 h-4 w-4" />
            API Keys
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 space-y-6">
          {/* Profile Settings */}
          <TabsContent value="profile" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your profile details and public information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  {profileLoading ? (
                    <Skeleton className="h-16 w-16 rounded-full" />
                  ) : (
                    <Avatar size="xl">
                      <AvatarFallback>
                        {(profile?.firstName?.[0] ?? '') + (profile?.lastName?.[0] ?? '')}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div>
                    <Button variant="outline" size="sm">
                      Change photo
                    </Button>
                    <p className="mt-1 text-xs text-neutral-500">
                      JPG, GIF or PNG. Max 2MB.
                    </p>
                  </div>
                </div>

                {/* Form fields */}
                {profileLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          First Name
                        </label>
                        <Input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Last Name
                        </label>
                        <Input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Email
                      </label>
                      <Input type="email" value={email} disabled />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Role
                      </label>
                      <Input defaultValue={profile?.role ?? ''} disabled />
                    </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Timezone
                  </label>
                  <Select defaultValue="utc">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utc">UTC (Coordinated Universal Time)</SelectItem>
                      <SelectItem value="est">EST (Eastern Standard Time)</SelectItem>
                      <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
                      <SelectItem value="gmt">GMT (Greenwich Mean Time)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} disabled={updateProfile.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="mt-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  Change your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Current Password
                  </label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    New Password
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Confirm New Password
                  </label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-sm text-danger-500">Passwords do not match</p>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={handleChangePassword}
                    disabled={
                      changePassword.isPending ||
                      !currentPassword ||
                      !newPassword ||
                      newPassword !== confirmPassword
                    }
                  >
                    {changePassword.isPending ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-100 dark:bg-success-950">
                      <Smartphone className="h-5 w-5 text-success-600 dark:text-success-400" />
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        Authenticator App
                      </p>
                      <p className="text-sm text-neutral-500">
                        Use an authentication app for 2FA
                      </p>
                    </div>
                  </div>
                  <Badge variant={profile?.mfaEnabled ? 'success' : 'warning'}>
                    {profile?.mfaEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Manage your active sessions across devices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-neutral-400" />
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        Chrome on Windows
                      </p>
                      <p className="text-sm text-neutral-500">
                        New York, US • Current session
                      </p>
                    </div>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-neutral-400" />
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        Safari on iPhone
                      </p>
                      <p className="text-sm text-neutral-500">
                        New York, US • 2 hours ago
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Revoke
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Transaction Alerts
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Large transactions
                        </p>
                        <p className="text-xs text-neutral-500">
                          Get notified for transactions over $10,000
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Failed transactions
                        </p>
                        <p className="text-xs text-neutral-500">
                          Get notified when transactions fail
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Pending approvals
                        </p>
                        <p className="text-xs text-neutral-500">
                          Notify when transactions need approval
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Security Alerts
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          New device login
                        </p>
                        <p className="text-xs text-neutral-500">
                          Alert when signing in from a new device
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Suspicious activity
                        </p>
                        <p className="text-xs text-neutral-500">
                          Get alerts for unusual account activity
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>Save Preferences</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Settings */}
          <TabsContent value="billing" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Plan</CardTitle>
                <CardDescription>
                  Manage your subscription and billing details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-900 dark:bg-primary-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                          Enterprise Plan
                        </h4>
                        <Badge variant="success">Active</Badge>
                      </div>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        Unlimited transactions • Priority support • Custom SLA
                      </p>
                    </div>
                    <Button variant="outline">Manage Plan</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys */}
          <TabsContent value="api" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Manage API keys for programmatic access
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {keysLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (apiKeys ?? []).length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    No API keys yet. Create one to get started.
                  </p>
                ) : (
                  (apiKeys ?? []).map((key) => (
                    <div
                      key={key.id}
                      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-neutral-900 dark:text-neutral-100">
                              {key.name}
                            </p>
                            {key.revoked && <Badge variant="danger">Revoked</Badge>}
                          </div>
                          <p className="mt-1 font-mono text-sm text-neutral-500">
                            {key.keyPrefix}••••••••••••••••
                          </p>
                          {key.lastUsedAt && (
                            <p className="mt-1 text-xs text-neutral-400">
                              Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!key.revoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeApiKey.mutate(key.id)}
                              disabled={revokeApiKey.isPending}
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Key name (e.g. Production)"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button onClick={handleCreateKey} disabled={createApiKey.isPending || !newKeyName.trim()}>
                    <Plus className="mr-2 h-4 w-4" />
                    {createApiKey.isPending ? 'Creating...' : 'Create API Key'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
