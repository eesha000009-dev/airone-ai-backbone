import type { FileNode } from '@/types/ide';

// ── Sample Project Files for Demo ────────────────────────────────

export const SAMPLE_PROJECT = {
  files: [
    {
      name: 'my-robot',
      path: '/my-robot',
      type: 'directory' as const,
      children: [
        {
          name: 'my-robot.airo',
          path: '/my-robot/my-robot.airo',
          type: 'file' as const,
          language: 'airo',
        },
        {
          name: 'body',
          path: '/my-robot/body',
          type: 'directory' as const,
          children: [
            {
              name: 'actuation',
              path: '/my-robot/body/actuation',
              type: 'directory' as const,
              children: [
                {
                  name: 'hands.airo',
                  path: '/my-robot/body/actuation/hands.airo',
                  type: 'file' as const,
                  language: 'airo',
                },
              ],
            },
            {
              name: 'sight',
              path: '/my-robot/body/sight',
              type: 'directory' as const,
              children: [
                {
                  name: 'eyes.airo',
                  path: '/my-robot/body/sight/eyes.airo',
                  type: 'file' as const,
                  language: 'airo',
                },
              ],
            },
            {
              name: 'hearing',
              path: '/my-robot/body/hearing',
              type: 'directory' as const,
              children: [
                {
                  name: 'ears.airo',
                  path: '/my-robot/body/hearing/ears.airo',
                  type: 'file' as const,
                  language: 'airo',
                },
              ],
            },
            {
              name: 'speech',
              path: '/my-robot/body/speech',
              type: 'directory' as const,
              children: [
                {
                  name: 'mouth.airo',
                  path: '/my-robot/body/speech/mouth.airo',
                  type: 'file' as const,
                  language: 'airo',
                },
              ],
            },
            {
              name: 'other_sensors',
              path: '/my-robot/body/other_sensors',
              type: 'directory' as const,
              children: [
                {
                  name: 'temperature.airo',
                  path: '/my-robot/body/other_sensors/temperature.airo',
                  type: 'file' as const,
                  language: 'airo',
                },
              ],
            },
          ],
        },
        {
          name: 'build',
          path: '/my-robot/build',
          type: 'directory' as const,
          children: [
            {
              name: 'firmware',
              path: '/my-robot/build/firmware',
              type: 'directory' as const,
              children: [],
            },
          ],
        },
      ],
    },
    {
      name: 'examples',
      path: '/examples',
      type: 'directory' as const,
      children: [
        {
          name: 'zeeb.airo',
          path: '/examples/zeeb.airo',
          type: 'file' as const,
          language: 'airo',
        },
        {
          name: 'servo-bot.airo',
          path: '/examples/servo-bot.airo',
          type: 'file' as const,
          language: 'airo',
        },
      ],
    },
  ] as FileNode[],

  fileContents: {
    '/my-robot/my-robot.airo': `# ============================================
# MY-ROBOT - Airone Robot
# ============================================

#library#
# Import body modules for your robot
call body/actuation/hands.airo.
call body/sight/eyes.airo.
call body/hearing/ears.airo.
call body/speech/mouth.airo.
call body/other_sensors/temperature.airo.

Pin defi {
    # pin_name = pin_number; mode.
    # mode: input (brings data in / senses) or output (makes action)
    ledpin = 2; output.
    temperature_sensor = 35; input.
    ultrasonic = 34; input.
    camera = 33; input.
    microphone = 32; input.
}

#variables#
# Brain URL — where your AI brain lives
brain_url = "wss://my-brain.local:8080".
call brain_url.

# ============================================
# MAIN LOOP — The robot runs this forever
# SENSE → THINK → ACT
# ============================================
loop {
    # Phase 1: SENSE — Read all input sensors
    # Only place sensors/modules that bring in data or sense
    read_for(1000) {
        temperature.
        eyes.
        ears.
    }

    # Phase 2: THINK — Send data to brain via WebSocket
    senddatato(brain_url).

    # Phase 3: ACT — Execute brain commands
    # Only place output modules here (things that make actions)
    actfor(1000) {
        ledpin.
        hands.
    }
}`,

    '/my-robot/body/actuation/hands.airo': `# Hands Actuation Module
# Controls servo-driven hands for grasping

pin defi {
    servo_left = 13; output.
    servo_right = 12; output.
    grip_sensor = 27; input.
}`,

    '/my-robot/body/sight/eyes.airo': `# Eyes / Vision Module
# Ultrasonic distance sensor

pin defi {
    ultrasonic_trig = 26; output.
    ultrasonic_echo = 25; input.
}`,

    '/my-robot/body/hearing/ears.airo': `# Ears / Hearing Module
# Microphone input for voice commands

pin defi {
    microphone = 32; input.
    audio_enable = 14; output.
}`,

    '/my-robot/body/speech/mouth.airo': `# Mouth / Speech Module
# Speaker output for voice responses

pin defi {
    speaker = 4; output.
    speech_enable = 16; output.
}`,

    '/my-robot/body/other_sensors/temperature.airo': `# Temperature Sensor Module
# DHT11/DHT22 temperature and humidity

pin defi {
    dht_pin = 35; input.
}`,

    '/examples/zeeb.airo': `# ============================================
# ZEEB ROBOT - Humanoid Pick-and-Place
# ============================================

#library#
call body/actuation/upper-right-hands.airo.
call body/actuation/lower-right-hands.airo.
call body/actuation/upper-left-hands.airo.
call body/actuation/lower-left-hands.airo.
call body/actuation/upper-right-legs.airo.
call body/actuation/lower-right-legs.airo.
call body/actuation/upper-left-legs.airo.
call body/actuation/lower-left-legs.airo.
call body/hearing/ears.airo.
call body/sight/eyes.airo.
call body/speech/mouth.airo.
call body/other_sensors/temperature.airo.

Pin defi {
    ledpin = 2; output.
    temperature_sensor = 35; input.
    ultrasonic = 34; input.
    camera = 33; input.
    microphone = 32; input.
}

#variables#
brain_url = "wss://zeeb-brain.local:8080".
call brain_url.

# Aliases
body/other_sensors/temperature.airo = temperature.
body/speech/mic.airo = mouth.
body/sight/ultrasonic-sensor.airo = eyes.
body/hearing/ears.airo = ears.
body/actuation/lower-left-legs.airo = llleg.
body/actuation/upper-left-legs.airo = ulleg.
body/actuation/lower-right-legs.airo = lrlegs.
body/actuation/upper-right-legs.airo = urlegs.
body/actuation/lower-left-hands.airo = llhands.
body/actuation/lower-right-hands.airo = lrhands.
body/actuation/upper-right-hands.airo = urhands.
body/actuation/upper-left-hands.airo = ulhands.

loop {
    read_for(1000) {
        temperature.
        eyes.
        ears.
    }

    senddatato(brain_url).

    actfor(1000) {
        ledpin.
        urhands.
        llleg.
    }
}`,

    '/examples/servo-bot.airo': `# ============================================
# SERVO-BOT - Simple Servo Robot
# ============================================

#library#

Pin defi {
    servo_x = 13; output.
    servo_y = 12; output.
    button = 0; input.
    led = 2; output.
}

#variables#
brain_url = "wss://servo-brain.local:8080".
call brain_url.

init {
    led.
}

loop {
    read_for(500) {
        button.
    }

    if (button == 1) {
        servo_x.
        led.
    } else {
        servo_y.
    }

    senddatato(brain_url).

    actfor(500) {
        servo_x.
        servo_y.
        led.
    }
}`,

    '/new-robot.airo': `# ============================================
# MY-ROBOT - New Airone Robot
# ============================================

#library#
# Import body modules for your robot
# call body/actuation/hands.airo.
# call body/sight/eyes.airo.

pin defi {
    ledpin = 2; output.
    # temperature_sensor = 35; input.
}

#variables#
brain_url = "wss://your-brain.local:8080".
call brain_url.

loop {
    read_for(1000) {
        # temperature.
    }

    senddatato(brain_url).

    actfor(1000) {
        ledpin.
    }
}`,
  },
};
