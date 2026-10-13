import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { createBooking, fetchAvailability, type Availability, type Booking } from '../lib/api.ts'
import { addDays, countNights, formatDate, today } from '../lib/dates.ts'
import { Eyebrow, PageHeader } from '../components/brand.tsx'
import { useRooms } from '../content/content.ts'
import { findRoom, guestsLabel, roomImageUrl } from '../content/rooms.ts'
import { Seo } from '../components/Seo.tsx'

type AvailabilityState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; rooms: Availability[] }

/** Result of an availability request, with the stay it was requested for */
type AvailabilityResult = { stay: string } & ({ rooms: Availability[] } | { error: string })

// The stay is kept in the URL (`?room=201&checkIn=…&checkOut=…&guests=2`), so other pages can link to a prefilled booking.
export function BookingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const roomId = searchParams.get('room') ?? ''
  const checkIn = searchParams.get('checkIn') ?? ''
  const checkOut = searchParams.get('checkOut') ?? ''
  const guests = Number(searchParams.get('guests') ?? 2)

  const [guestName, setGuestName] = useState('')
  const [availabilityResult, setAvailabilityResult] = useState<AvailabilityResult>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [booking, setBooking] = useState<Booking>()

  const rooms = useRooms()
  const room = findRoom(rooms, roomId)
  const nights = countNights(checkIn, checkOut)
  const hasValidStay = Boolean(checkIn && checkOut) && nights > 0
  const stay = `${checkIn}/${checkOut}/${guests}`

  let availability: AvailabilityState = { status: 'idle' }
  if (hasValidStay) {
    if (availabilityResult?.stay !== stay) availability = { status: 'loading' }
    else if ('error' in availabilityResult) availability = { status: 'error', message: availabilityResult.error }
    else availability = { status: 'done', rooms: availabilityResult.rooms }
  }
  const roomAvailability = availability.status === 'done' ? availability.rooms.find((item) => item.id === roomId) : undefined


  const update = (values: Record<string, string>) => {
    setSearchParams(
      (params) => {
        for (const [name, value] of Object.entries(values)) {
          if (value) params.set(name, value)
          else params.delete(name)
        }
        return params
      },
      { replace: true, preventScrollReset: true },
    )
  }

  // Keeps the stay valid by moving the check-out after the new check-in
  const changeCheckIn = (value: string) =>
    update({ checkIn: value, checkOut: checkOut && checkOut > value ? checkOut : value && addDays(value, 1) })

  useEffect(() => {
    if (!hasValidStay) return
    let ignore = false
    fetchAvailability({ checkIn, checkOut, guests })
      .then((availableRooms) => !ignore && setAvailabilityResult({ stay, rooms: availableRooms }))
      .catch((error: Error) => !ignore && setAvailabilityResult({ stay, error: error.message }))
    return () => {
      ignore = true
    }
  }, [checkIn, checkOut, guests, hasValidStay, stay])

  const book = async () => {
    setSubmitting(true)
    setError(undefined)
    try {
      const createdBooking = await createBooking({ roomId, guestName, guests, checkIn, checkOut })
      setBooking(createdBooking)
      return createdBooking
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setError(message)
      throw new Error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // The page shows the error
    book().catch(() => {})
  }

  if (booking) {
    return (
      <div className="container section narrow">
        <Seo title="Booking confirmed" description="Your booking at Hotel Seeblick is confirmed." />
        <div className="confirmation" role="status">
          <Eyebrow>Bis bald</Eyebrow>
          <h1>Thank you, {booking.guestName}!</h1>
          <p>Your booking is confirmed. We look forward to welcoming you.</p>
          <dl className="facts">
            <dt>Booking number</dt>
            <dd>#{booking.id}</dd>
            <dt>Room</dt>
            <dd>{booking.roomName}</dd>
            <dt>Check-in</dt>
            <dd>{formatDate(booking.checkIn)}</dd>
            <dt>Check-out</dt>
            <dd>{formatDate(booking.checkOut)}</dd>
            <dt>Guests</dt>
            <dd>{guestsLabel(booking.guests)}</dd>
            <dt>Total</dt>
            <dd>
              €{booking.totalPrice} for {booking.nights} {booking.nights === 1 ? 'night' : 'nights'}
            </dd>
          </dl>
          <Link className="text-link" to="/">
            Back to the homepage →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Seo
        title="Book your stay"
        description="Check the availability of all rooms of Hotel Seeblick for your dates and book directly at the best price."
      />
      <PageHeader eyebrow="Buchen" title="Book your stay">
        <p className="lead">Choose your dates, pick a room and book directly with us.</p>
      </PageHeader>

      <div className="container section booking-layout">
        <form id="booking-form" className="booking-form" onSubmit={submit}>
          <fieldset>
            <legend>1. Your stay</legend>
            <div className="form-row">
              <label>
                Check-in
                <input name="checkIn" type="date" required min={today()} value={checkIn} onChange={(event) => changeCheckIn(event.target.value)} />
              </label>
              <label>
                Check-out
                <input
                  name="checkOut"
                  type="date"
                  required
                  min={checkIn ? addDays(checkIn, 1) : today()}
                  value={checkOut}
                  onChange={(event) => update({ checkOut: event.target.value })}
                />
              </label>
              <label>
                Guests
                <select name="guests" value={guests} onChange={(event) => update({ guests: event.target.value })}>
                  {[1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {guestsLabel(count)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>2. Your room</legend>
            {availability.status === 'idle' && <p className="hint">Choose your dates to see which rooms are available.</p>}
            {availability.status === 'loading' && <p className="hint">Checking availability…</p>}
            {availability.status === 'error' && <p className="error">{availability.message}</p>}
            <div className="room-options" role="radiogroup" aria-label="Room">
              {rooms.map((option) => {
                const optionAvailability = availability.status === 'done' ? availability.rooms.find((item) => item.id === option.id) : undefined
                const unavailable = availability.status === 'done' && !optionAvailability
                return (
                  <label key={option.id} className={unavailable ? 'room-option room-option-unavailable' : 'room-option'}>
                    <input
                      type="radio"
                      name="room"
                      required
                      value={option.id}
                      checked={roomId === option.id}
                      disabled={unavailable}
                      onChange={() => update({ room: option.id })}
                    />
                    <img src={roomImageUrl(option)} alt="" />
                    <span className="room-option-text">
                      <strong>{option.name}</strong>
                      <span>
                        up to {guestsLabel(option.maxGuests)} · €{option.pricePerNight} / night
                      </span>
                    </span>
                    <span className="room-option-price">
                      {optionAvailability && `€${optionAvailability.totalPrice}`}
                      {unavailable && (option.maxGuests < guests ? 'Too small' : 'Booked')}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>3. Your details</legend>
            <label>
              Name
              <input name="guestName" required autoComplete="name" value={guestName} onChange={(event) => setGuestName(event.target.value)} />
            </label>
          </fieldset>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>

        <aside className="booking-summary" aria-label="Summary">
          <h2>Summary</h2>
          {room ? (
            <>
              <img src={roomImageUrl(room)} alt={room.name} />
              <p>
                <strong>{room.name}</strong>
              </p>
            </>
          ) : (
            <p className="hint">No room chosen yet.</p>
          )}
          <dl className="facts">
            <dt>Check-in</dt>
            <dd>{checkIn ? formatDate(checkIn) : '–'}</dd>
            <dt>Check-out</dt>
            <dd>{checkOut ? formatDate(checkOut) : '–'}</dd>
            <dt>Guests</dt>
            <dd>{guestsLabel(guests)}</dd>
            {room && hasValidStay && (
              <>
                <dt>
                  {nights} × €{room.pricePerNight}
                </dt>
                <dd className="total">€{roomAvailability?.totalPrice ?? nights * room.pricePerNight}</dd>
              </>
            )}
          </dl>
          <button
            className="button button-brass"
            type="submit"
            form="booking-form"
            disabled={submitting || !room || !hasValidStay || !guestName.trim() || (availability.status === 'done' && !roomAvailability)}
          >
            {submitting ? 'Booking…' : 'Book now'}
          </button>
          <p className="hint">Breakfast included. Free cancellation until 24 hours before arrival.</p>
        </aside>
      </div>
    </>
  )
}
