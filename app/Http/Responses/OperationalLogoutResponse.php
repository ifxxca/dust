<?php

namespace App\Http\Responses;

use Laravel\Fortify\Http\Responses\LogoutResponse;
use Symfony\Component\HttpFoundation\Response;

class OperationalLogoutResponse extends LogoutResponse
{
    public function toResponse(mixed $request): Response
    {
        return $request->wantsJson() ? response()->json(['data' => null, 'meta' => new \stdClass]) : parent::toResponse($request);
    }
}
