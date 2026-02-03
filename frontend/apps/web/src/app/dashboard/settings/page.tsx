'use client';

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
  AvatarImage,
  Badge,
} from '@nexus/ui';
import { User, Shield, Bell, CreditCard, Key, Globe, Smartphone, Save } from 'lucide-react';

export default function SettingsPage() {
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
                  <Avatar size="xl">
                    <AvatarImage src="/avatars/user.jpg" alt="Profile" />
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      First Name
                    </label>
                    <Input defaultValue="John" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Last Name
                    </label>
                    <Input defaultValue="Doe" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Email
                  </label>
                  <Input type="email" defaultValue="john@nexus-rtp.com" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Role
                  </label>
                  <Input defaultValue="Treasury Manager" disabled />
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
                  <Button>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
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
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    New Password
                  </label>
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Confirm New Password
                  </label>
                  <Input type="password" />
                </div>
                <div className="flex justify-end">
                  <Button>Update Password</Button>
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
                  <Badge variant="success">Enabled</Badge>
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
                        <Badge variant="primary">Active</Badge>
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
                <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        Production Key
                      </p>
                      <p className="mt-1 font-mono text-sm text-neutral-500">
                        nxs_live_••••••••••••••••
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        Copy
                      </Button>
                      <Button variant="ghost" size="sm">
                        Regenerate
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        Test Key
                      </p>
                      <p className="mt-1 font-mono text-sm text-neutral-500">
                        nxs_test_••••••••••••••••
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        Copy
                      </Button>
                      <Button variant="ghost" size="sm">
                        Regenerate
                      </Button>
                    </div>
                  </div>
                </div>
                <Button>
                  <Key className="mr-2 h-4 w-4" />
                  Create New API Key
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
