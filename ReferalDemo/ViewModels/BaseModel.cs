namespace ReferalDemo.ViewModels
{
    public class BaseModel
    {
        public string UserId { get; set; }
        public string Phone { get; set; }
        public string PhoneCode { get; set; }

        public string GetPhone()
            => PhoneCode + Phone;
    }
}
