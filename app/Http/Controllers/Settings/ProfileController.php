<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\ProfileDeleteRequest;
use App\Http\Requests\Settings\ProfileUpdateRequest;
use App\Models\Customer;
use App\Models\HandoverEvent;
use App\Models\HandoverItemRevision;
use App\Models\HandoverSession;
use App\Models\PickupRecordRevision;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use App\Models\PickupTaskEvent;
use App\Models\ReceiptAttempt;
use App\Models\User;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Show the user's profile settings page.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('settings/profile', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => $request->session()->get('status'),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Profile updated.')]);

        return to_route('profile.edit');
    }

    /**
     * Delete the user's profile.
     */
    public function destroy(ProfileDeleteRequest $request): RedirectResponse
    {
        $user = $request->user();

        DB::transaction(function () use ($user): void {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($locked->role === 'admin_supervisor'
                || Customer::where('created_by', $locked->id)->exists()
                || PickupTask::where('created_by', $locked->id)->orWhere('assigned_staff_id', $locked->id)->exists()
                || PickupTaskEvent::where('actor_id', $locked->id)->orWhere('previous_staff_id', $locked->id)->orWhere('new_staff_id', $locked->id)->exists(), 409, 'Akun terkait transaksi operasional tidak dapat dihapus. Hubungi Admin.');
            abort_if(PickupSchedule::where('created_by', $locked->id)->orWhere('updated_by', $locked->id)->exists()
                || PickupRecordRevision::where('actor_id', $locked->id)->exists()
                || HandoverItemRevision::where('actor_id', $locked->id)->exists()
                || HandoverEvent::where('actor_id', $locked->id)->exists()
                || HandoverSession::where('created_by', $locked->id)->orWhere('closed_by', $locked->id)->exists()
                || ReceiptAttempt::where('actor_id', $locked->id)->exists(), 409, 'Akun terkait riwayat operasional tidak dapat dihapus. Hubungi Admin.');
            $locked->delete();
        });

        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
