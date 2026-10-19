import __main__
import time
import rc_module
from machine import Pin, PWM

# Initialize the remote control receiver
rc_module.rc_slave_init()

# Instantiate the servo and motor controller
servos = ServosController()
motors = MotorsController()

# Define the neutral calibration value and deadband tolerance of the joystick
CENTER_ADC = 2048   
DEADZONE = 250     

while True:
    # Receive the latest frame of channel data from the remote controller
    rc_data = rc_module.rc_slave_data()
    
    if rc_data:

        # =================【L1 Channel: Three-position switch controls rotating base】=================
        L1_adc = rc_data[0]      # Read the ADC signal of the L1 toggle switch

        if L1_adc > 3000:
            motors.set_speed(2, 1024)   # Gear II: Forward rotation

        elif L1_adc < 1000:
            motors.set_speed(2, -1024)  # Gear I: Reverse

        else:
            motors.set_speed(2, 0)      # Gear O: Stop the motor

        # =================【L3 Channel: Left joystick controls S1 180° stepper servo】=================
        L3_adc = rc_data[2]      # Read the ADC signal of the L3 joystick
        
        if L3_adc > (CENTER_ADC + DEADZONE):
            servos.set_angle_stepping(1, 180, 10)  # Push the joystick up/right: the servo performs smooth stepping toward 180° (step size 10)
            
        elif L3_adc < (CENTER_ADC - DEADZONE):
            servos.set_angle_stepping(1, 0, 10)    # Push joystick down/left: The servo smoothly steps toward 0° (step size 10) 

        else:
            # Joystick returns to center and stays stationary
            servos.set_angle_step(1, 0)

        # =================【R1 Channel: Right joystick controls S3 360° servo motor】=================
        R1_adc = rc_data[3]      # Read the ADC signal of the R1 joystick
        
        if R1_adc > (CENTER_ADC + DEADZONE):
            servos.set_speed(3, 50)     # Push the joystick to one side: Servo No.3 rotates forward continuously at 50% speed    
            
        elif R1_adc < (CENTER_ADC - DEADZONE):
            servos.set_speed(3, -50)    # Push the joystick to the other side: No.3 continuous rotation servo reverses at 50% speed
            
        else:
            servos.set_speed(3, 0)      # Joystick centering: Servo 3 stops rotating
            
        # =================【R3 Channel: Right joystick controls S2 180° stepper servo】=================
        R3_adc = rc_data[5]      # Read the ADC signal of the R3 joystick
        
        if R3_adc > (CENTER_ADC + DEADZONE):
            servos.set_angle_stepping(2, 180, 10)  # Push the joystick to one side: the servo performs smooth stepping toward 180° (step size 10)
            
        elif R3_adc < (CENTER_ADC - DEADZONE):
            servos.set_angle_stepping(2, 0, 10)    # Push the joystick to the other side: The servo smoothly steps toward 0° (step size 10) 
            
        else:
            # Joystick returns to center and stays stationary
            servos.set_angle_step(2, 0)

        # Servo status update
        servos.timing_proc()  
        time.sleep_ms(10)     